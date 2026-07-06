import React, { useState, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  MagnifyingGlassIcon, DocumentIcon, CameraIcon, HeartIcon, ReceiptPercentIcon,
  AcademicCapIcon, ArrowTopRightOnSquareIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { todaySG } from '../../utils/attendanceUtils';
import styles from './UploadsAudit.module.css';

const TYPE_TABS = [
  { value: 'all',     label: 'All'        },
  { value: 'selfie',  label: 'Selfies'    },
  { value: 'mc',      label: 'MCs'        },
  { value: 'receipt', label: 'Receipts'   },
  { value: 'cert',    label: 'Certs'      },
];

const TYPE_META = {
  selfie:  { label: 'Selfie',  Icon: CameraIcon,         cls: 'badgeBlue'   },
  mc:      { label: 'MC',      Icon: HeartIcon,          cls: 'badgeGreen'  },
  receipt: { label: 'Receipt', Icon: ReceiptPercentIcon, cls: 'badgeAmber'  },
  cert:    { label: 'Cert',    Icon: AcademicCapIcon,    cls: 'badgePurple' },
};

const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const isoDaysAgo = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })
  .format(new Date(Date.now() - n * 86400000));
const isImageUrl = (url) => !/\.pdf(\?|$)/i.test(url ?? '');

export default function UploadsAudit() {
  const { toast } = useToast();
  const [typeTab,  setTypeTab]  = useState('all');
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(30));
  const [dateTo,   setDateTo]   = useState(todaySG());
  const [nameQ,    setNameQ]    = useState('');
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const [attSnap, leaveSnap, pcSnap, workerSnap] = await Promise.all([
        getDocs(query(collection(db, 'attendance'),
          where('date', '>=', dateFrom), where('date', '<=', dateTo))),
        getDocs(query(collection(db, 'leaveApplications'),
          where('dateFrom', '>=', dateFrom), where('dateFrom', '<=', dateTo))),
        getDocs(query(collection(db, 'pettyCashClaims'),
          where('date', '>=', dateFrom), where('date', '<=', dateTo))),
        getDocs(collection(db, 'workers')),
      ]);

      const rows = [];

      attSnap.docs.forEach(d => {
        const r = d.data();
        if (r.clockIn?.photoUrl) rows.push({
          id: `${d.id}-in`, type: 'selfie', url: r.clockIn.photoUrl,
          name: r.name, team: r.team, date: r.date,
          detail: `Clock in${r.clockIn.address ? ` · ${r.clockIn.address}` : ''}`,
          status: null,
        });
        if (r.clockOut?.photoUrl) rows.push({
          id: `${d.id}-out`, type: 'selfie', url: r.clockOut.photoUrl,
          name: r.name, team: r.team, date: r.date,
          detail: `Clock out${r.clockOut.address ? ` · ${r.clockOut.address}` : ''}`,
          status: null,
        });
      });

      leaveSnap.docs.forEach(d => {
        const r = d.data();
        if (r.type === 'MC' && r.mcUrl) rows.push({
          id: d.id, type: 'mc', url: r.mcUrl,
          name: r.name, team: r.team, date: r.dateFrom,
          detail: `${r.days} day${r.days !== 1 ? 's' : ''}${r.mcClinic ? ` · ${r.mcClinic}` : ''}`,
          status: r.status,
        });
      });

      pcSnap.docs.forEach(d => {
        const r = d.data();
        if (r.receiptUrl) rows.push({
          id: d.id, type: 'receipt', url: r.receiptUrl,
          name: r.name, team: r.team, date: r.date,
          detail: `$${Number(r.amount ?? 0).toFixed(2)} · ${r.description ?? ''}`,
          status: r.status,
        });
      });

      // Worker certificates: filter by upload date when known; certificates
      // added before upload tracking existed are always shown.
      workerSnap.docs.forEach(d => {
        const w = d.data();
        (w.certs ?? []).forEach((c, i) => {
          if (!c.url) return;
          const upDate = c.uploadedAt ? c.uploadedAt.slice(0, 10) : '';
          if (upDate && (upDate < dateFrom || upDate > dateTo)) return;
          rows.push({
            id: `${d.id}-cert-${i}`, type: 'cert', url: c.url,
            name: w.name, team: w.team, date: upDate,
            detail: `${c.name ?? 'Certificate'}${c.expiry ? ` · exp ${c.expiry}` : ''}`,
            status: null,
          });
        });
      });

      rows.sort((a, b) => b.date.localeCompare(a.date));
      setItems(rows);
    } catch {
      toast.error('Failed to load uploads');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, toast]);

  const visible = items.filter(it =>
    (typeTab === 'all' || it.type === typeTab) &&
    (!nameQ.trim() || it.name?.toLowerCase().includes(nameQ.trim().toLowerCase()))
  );

  return (
    <div className={styles.wrap}>
      <p className={styles.info}>
        Audit trail of all uploaded files — attendance selfies, medical certificates and claim receipts.
      </p>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterRow}>
          <label className={styles.lbl}>From</label>
          <input type="date" className={styles.input} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <label className={styles.lbl}>To</label>
          <input type="date" className={styles.input} value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} />
          <button className={styles.loadBtn} onClick={load} disabled={loading}>
            <MagnifyingGlassIcon width={16} /> {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.tabs}>
            {TYPE_TABS.map(tab => (
              <button key={tab.value}
                className={[styles.tab, typeTab === tab.value ? styles.tabActive : ''].join(' ')}
                onClick={() => setTypeTab(tab.value)}>
                {tab.label}
                {searched && tab.value !== 'all' && (
                  <span className={styles.tabCount}>{items.filter(i => i.type === tab.value).length}</span>
                )}
              </button>
            ))}
          </div>
          <input className={styles.input} placeholder="Filter by name…" value={nameQ}
            onChange={e => setNameQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        </div>
      </div>

      {/* Results */}
      {!searched ? (
        <p className={styles.empty}>Choose a date range and press Load.</p>
      ) : loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : visible.length === 0 ? (
        <p className={styles.empty}>No uploads found for these filters.</p>
      ) : (
        <div className={styles.grid}>
          {visible.map(it => {
            const meta = TYPE_META[it.type];
            return (
              <div key={it.id} className={styles.card}>
                <button
                  className={styles.thumbWrap}
                  onClick={() => isImageUrl(it.url) ? setLightbox(it) : window.open(it.url, '_blank', 'noopener')}
                  title="View file"
                >
                  {isImageUrl(it.url)
                    ? <img src={it.url} alt="" className={styles.thumb} loading="lazy" />
                    : <div className={styles.pdfThumb}><DocumentIcon width={36} /><span>PDF</span></div>}
                </button>
                <div className={styles.cardBody}>
                  <div className={styles.cardTop}>
                    <span className={[styles.badge, styles[meta.cls]].join(' ')}>
                      <meta.Icon width={13} /> {meta.label}
                    </span>
                    {it.status && <span className={[styles.status, styles[`st_${it.status}`]].join(' ')}>{it.status}</span>}
                  </div>
                  <p className={styles.cardName}>{it.name}</p>
                  <p className={styles.cardMeta}>{fmtDate(it.date)}{it.team ? ` · ${it.team}` : ''}</p>
                  <p className={styles.cardDetail}>{it.detail}</p>
                  <a href={it.url} target="_blank" rel="noreferrer" className={styles.openLink}>
                    <ArrowTopRightOnSquareIcon width={13} /> Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)} aria-label="Close">
            <XMarkIcon width={26} />
          </button>
          <img src={lightbox.url} alt="" className={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          <p className={styles.lightboxCaption}>
            {lightbox.name} · {fmtDate(lightbox.date)} · {lightbox.detail}
          </p>
        </div>
      )}
    </div>
  );
}
