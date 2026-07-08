import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import {
  PlusIcon, TrashIcon, CheckIcon, PrinterIcon, EyeIcon,
  CameraIcon, DocumentIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import MaterialOrderForm from './MaterialOrderForm';
import { ITE_FORMS, ALL_SUPPLIERS, fmtSGD } from '../../utils/materialData';
import { printITEOrderForm } from '../../utils/printITEForm';
import { compressImage, uploadWorkerDoc, extractDocument } from '../../utils/workerDocs';
import styles from './Materials.module.css';

const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s));
const UNITS = ['pcs', 'm', 'roll', 'box', 'set', 'lot', 'length'];

const fmt = fmtSGD;
const fmtDate = (iso) => { if (!iso) return '—'; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

const EMPTY_ITEM = { description: '', qty: '', unit: 'pcs', unitPrice: '', amount: '' };

/* ── Supplier dropdown helpers ── */
const SUPPLIER_OPTIONS = [
  { value: 'ite',        label: 'ITE Electric Systems Co Pte Ltd' },
  { value: 'certis',     label: 'Certis Technology (S) Pte Ltd' },
  { value: 'wa-network', label: 'WA! Network Asia' },
  { value: 'other',      label: 'Other' },
];

/* ════════════════════════════════════════════════
   Delivery Orders Tab
═══════════════════════════════════════════════════ */
function DOModal({ projectId, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [doNo,     setDoNo]     = useState('');
  const [supplier, setSupplier] = useState('');
  const [date,     setDate]     = useState('');
  const [dropbox,  setDropbox]  = useState('');
  const [notes,    setNotes]    = useState('');
  const [items,    setItems]    = useState([{ ...EMPTY_ITEM }]);
  const [saving,   setSaving]   = useState(false);

  const [scanState, setScanState] = useState('none'); // none|working|done|failed
  const [scanPreview, setScanPreview] = useState(null);
  const [scanFileName, setScanFileName] = useState('');
  const scanInputRef = useRef(null);

  useEffect(() => () => { if (scanPreview) URL.revokeObjectURL(scanPreview); }, [scanPreview]);

  const handleScanFile = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    if (raw.size > 10 * 1024 * 1024) { toast.error('File too large (max 10 MB).'); return; }
    setScanState('working');
    try {
      const file = await compressImage(raw);
      const [url, ocr] = await Promise.all([
        uploadWorkerDoc(file, 'deliveryOrders', userProfile.userId),
        extractDocument(file, 'do').catch(() => null),
      ]);
      setDropbox(url);
      setScanFileName(raw.name);
      setScanPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
      if (ocr) {
        if (ocr.doNo) setDoNo(ocr.doNo);
        if (isISODate(ocr.date)) setDate(ocr.date);
        const matched = SUPPLIER_OPTIONS.find(s =>
          ocr.supplier && s.label.toLowerCase().includes(String(ocr.supplier).toLowerCase()));
        if (matched) setSupplier(matched.value);
        if (Array.isArray(ocr.items) && ocr.items.length) {
          setItems(ocr.items.map(it => {
            const qty = Number(it.qty) || '';
            const unitPrice = Number(it.unitPrice) || '';
            return {
              description: it.description ?? '',
              qty: qty || '',
              unit: UNITS.includes(it.unit) ? it.unit : 'pcs',
              unitPrice: unitPrice || '',
              amount: (qty && unitPrice) ? (qty * unitPrice).toFixed(2) : '',
            };
          }));
        }
      }
      setScanState(ocr ? 'done' : 'failed');
      if (!ocr) toast.error("Couldn't auto-read the DO — please fill in the details manually.");
    } catch {
      setScanState('none');
      toast.error('Upload failed — check your connection and try again.');
    }
  };

  const setItem = (i, key, val) => setItems(prev => {
    const next = [...prev];
    next[i] = { ...next[i], [key]: val };
    if (key === 'qty' || key === 'unitPrice') {
      const q  = key === 'qty'       ? Number(val) : Number(next[i].qty);
      const up = key === 'unitPrice' ? Number(val) : Number(next[i].unitPrice);
      next[i].amount = (q && up) ? (q * up).toFixed(2) : '';
    }
    return next;
  });
  const addItem    = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));
  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0);

  const handleSave = async () => {
    if (!doNo.trim()) { toast.error('DO number is required'); return; }
    if (items.every(it => !it.description.trim())) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const payload = {
        doNo: doNo.trim(), supplier: supplier.trim(),
        receivedDate: date || null,
        items: items.filter(it => it.description.trim()),
        totalAmount: total, dropboxUrl: dropbox.trim(),
        notes: notes.trim(), status: 'pending',
        createdAt: new Date(), createdBy: userProfile.userId,
        team: userProfile.team ?? '',
      };
      const ref = await addDoc(collection(db, 'projects', projectId, 'deliveryOrders'), payload);
      onSaved({ id: ref.id, ...payload });
      toast.success('DO recorded');
      onClose();
    } catch { toast.error('Failed to save DO'); }
    finally   { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Add Delivery Order" size="lg">
      <div className={styles.modalBody}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.label}>DO Number *</label>
            <input className={styles.input} value={doNo} onChange={e => setDoNo(e.target.value)} placeholder="e.g. DO-2025-001" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Supplier</label>
            <select className={styles.input} value={supplier} onChange={e => setSupplier(e.target.value)}>
              <option value="">Select supplier…</option>
              {SUPPLIER_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Received Date</label>
            <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className={[styles.field, styles.fieldFull].join(' ')}>
            <label className={styles.label}>DO Scan <span className={styles.opt}>(photo or PDF — auto-fills the details on this form)</span></label>

            {scanState === 'none' && (
              <button type="button" className={styles.scanUploadBtn} onClick={() => scanInputRef.current?.click()}>
                <CameraIcon width={16} /> Scan / Upload DO
              </button>
            )}

            {scanState === 'working' && (
              <div className={styles.scanWorking}><div className={styles.spinner} /> Reading DO…</div>
            )}

            {(scanState === 'done' || scanState === 'failed') && (
              <div className={styles.scanResult}>
                {scanPreview
                  ? <img src={scanPreview} alt="DO scan" className={styles.scanPreviewImg} />
                  : (
                    <div className={styles.scanPdfBadge}>
                      <DocumentIcon width={20} style={{ flexShrink: 0 }} />
                      {scanFileName}
                    </div>
                  )}
                <div className={styles.scanResultMeta}>
                  <button type="button" className={styles.scanRetakeBtn} onClick={() => scanInputRef.current?.click()}>
                    Retake
                  </button>
                  {scanState === 'done' ? (
                    <span className={styles.scanNoteOk}><CheckIcon width={13} /> Auto-filled — please verify the details below.</span>
                  ) : (
                    <span className={styles.scanNoteWarn}><ExclamationTriangleIcon width={13} /> Couldn't auto-read — please fill in manually.</span>
                  )}
                </div>
              </div>
            )}

            <input ref={scanInputRef} type="file" accept="image/*,application/pdf"
              style={{ display: 'none' }} onChange={handleScanFile} />
          </div>
        </div>
        <div>
          <div className={styles.itemsHeader}>
            <span className={styles.label}>Items</span>
            <button className={styles.addItemBtn} onClick={addItem} type="button"><PlusIcon width={13} /> Add Row</button>
          </div>
          <div className={styles.itemsTable}>
            <div className={styles.itemsHead}>
              <span>Description</span><span>Qty</span><span>Unit</span><span>Unit Price</span><span>Amount</span><span></span>
            </div>
            {items.map((it, i) => (
              <div key={i} className={styles.itemRow}>
                <input className={styles.input} value={it.description} onChange={e => setItem(i, 'description', e.target.value)} placeholder="Item description" />
                <input className={styles.input} type="number" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} placeholder="0" min="0" />
                <select className={styles.input} value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input className={styles.input} type="number" value={it.unitPrice} onChange={e => setItem(i, 'unitPrice', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                <input className={[styles.input, styles.inputReadonly].join(' ')} value={it.amount ? `$${Number(it.amount).toFixed(2)}` : ''} readOnly placeholder="—" />
                <button className={styles.removeBtn} onClick={() => removeItem(i)} disabled={items.length === 1}><TrashIcon width={13} /></button>
              </div>
            ))}
            <div className={styles.itemsTotal}><span>Total</span><span className={styles.totalAmt}>{fmt(total)}</span></div>
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Notes</label>
          <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes…" />
        </div>
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save DO</Button>
        </div>
      </div>
    </Modal>
  );
}

function DeliveryOrdersTab({ project, canAdmin }) {
  const { toast } = useToast();
  const [dos,     setDos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'projects', project.id, 'deliveryOrders'))
      .then(snap => setDos(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))))
      .catch(() => toast.error('Failed to load DOs'))
      .finally(() => setLoading(false));
  }, [project.id, toast]);

  const verifyDO = async (doId) => {
    try {
      await updateDoc(doc(db, 'projects', project.id, 'deliveryOrders', doId), { status: 'verified' });
      setDos(prev => prev.map(d => d.id === doId ? { ...d, status: 'verified' } : d));
      toast.success('DO verified');
    } catch { toast.error('Failed to verify DO'); }
  };

  const totalAll      = dos.reduce((s, d) => s + (d.totalAmount ?? 0), 0);
  const totalVerified = dos.filter(d => d.status === 'verified').reduce((s, d) => s + (d.totalAmount ?? 0), 0);

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <>
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}><span className={styles.summaryVal}>{dos.length}</span><span className={styles.summaryLabel}>Delivery Orders</span></div>
        <div className={styles.summaryCard}><span className={styles.summaryVal}>{fmt(totalAll)}</span><span className={styles.summaryLabel}>Total Materials Cost</span><span className={styles.summarySub}>Deducted from Stage 2 Claim</span></div>
        <div className={styles.summaryCard}><span className={[styles.summaryVal, styles.summaryGreen].join(' ')}>{fmt(totalVerified)}</span><span className={styles.summaryLabel}>Verified</span></div>
        <div className={styles.summaryCard}><span className={[styles.summaryVal, styles.summaryAmber].join(' ')}>{fmt(totalAll - totalVerified)}</span><span className={styles.summaryLabel}>Pending Verification</span></div>
      </div>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Delivery Orders</h3>
          <p className={styles.sectionNote}>Verified cost ({fmt(totalVerified)}) deducted from Stage 2 Certis claim</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><PlusIcon width={14} /> Add DO</Button>
      </div>
      {dos.length === 0 ? (
        <div className={styles.empty}><p>No delivery orders recorded yet.</p><p>Log received DOs to track material costs.</p></div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>DO No.</th><th>Supplier</th><th>Received</th><th>Items</th><th>Total</th><th>Status</th><th>Scan</th>{canAdmin && <th></th>}</tr></thead>
            <tbody>
              {dos.map(d => (
                <tr key={d.id} className={styles.row}>
                  <td className={styles.tdBold}>{d.doNo}</td>
                  <td>{ALL_SUPPLIERS[d.supplier]?.shortLabel ?? d.supplier ?? '—'}</td>
                  <td>{d.receivedDate ? fmtDate(d.receivedDate) : '—'}</td>
                  <td className={styles.tdCenter}>{(d.items ?? []).length}</td>
                  <td className={styles.tdAmt}>{fmt(d.totalAmount)}</td>
                  <td><Badge color={d.status === 'verified' ? 'green' : 'amber'}>{d.status}</Badge></td>
                  <td>{d.dropboxUrl ? <a href={d.dropboxUrl} target="_blank" rel="noreferrer" className={styles.scanLink}>View</a> : <span className={styles.na}>—</span>}</td>
                  {canAdmin && <td>{d.status !== 'verified' && <button className={styles.verifyBtn} onClick={() => verifyDO(d.id)}><CheckIcon width={13} /> Verify</button>}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot><tr className={styles.totalRow}><td colSpan={4}><strong>Total</strong></td><td className={styles.tdAmt}><strong>{fmt(totalAll)}</strong></td><td colSpan={canAdmin ? 3 : 2} /></tr></tfoot>
          </table>
        </div>
      )}
      {showAdd && <DOModal projectId={project.id} onClose={() => setShowAdd(false)} onSaved={d => setDos(prev => [d, ...prev])} />}
    </>
  );
}

/* ════════════════════════════════════════════════
   Order View Modal
═══════════════════════════════════════════════════ */
function OrderViewModal({ order, onClose, canViewCosts }) {
  const isITE = ['class3', 'class4', 'trunking'].includes(order.formType);
  const formConfig = ITE_FORMS[order.formType];

  return (
    <Modal isOpen onClose={onClose} title={`Order ${order.ref ?? ''}`} size="lg">
      <div className={styles.modalBody}>
        <div className={styles.formGrid}>
          <div className={styles.field}><label className={styles.label}>Supplier</label><p className={styles.viewVal}>{ALL_SUPPLIERS[order.supplier]?.label ?? order.supplier}</p></div>
          <div className={styles.field}><label className={styles.label}>Date</label><p className={styles.viewVal}>{fmtDate(order.date)}</p></div>
          {order.siteContact && <div className={styles.field}><label className={styles.label}>Site Contact</label><p className={styles.viewVal}>{order.siteContact}</p></div>}
          {order.deliveryAddress && <div className={styles.field}><label className={styles.label}>Delivery Address</label><p className={styles.viewVal}>{order.deliveryAddress}</p></div>}
        </div>
        {isITE && formConfig && (
          <div>
            {formConfig.sections.map(sec => {
              const hasItems = sec.items.some(it => Number(order.quantities?.[it.id] ?? 0) > 0);
              if (!hasItems) return null;
              return (
                <div key={sec.header} className={styles.itemSection}>
                  <div className={styles.sectionBand}>{sec.header}</div>
                  {sec.items.filter(it => Number(order.quantities?.[it.id] ?? 0) > 0).map(it => (
                    <div key={it.id} className={[styles.viewItemRow, canViewCosts ? '' : styles.viewItemRowSlim].join(' ')}>
                      <span className={styles.itemDesc}>{it.desc}</span>
                      <span className={styles.viewQty}>×{order.quantities[it.id]}</span>
                      {canViewCosts && <span className={styles.itemAmt}>{fmtSGD(it.unitPrice * Number(order.quantities[it.id]))}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {!isITE && Array.isArray(order.items) && (
          <div className={styles.itemSection}>
            {order.items.map((it, i) => (
              <div key={i} className={styles.viewItemRow}>
                <span className={styles.itemDesc}>{it.desc}</span>
                <span className={styles.viewQty}>×{it.qty} {it.unit}</span>
              </div>
            ))}
          </div>
        )}
        {order.notes && <p className={styles.viewNotes}>{order.notes}</p>}
        <div className={styles.modalFooter}>
          {isITE && <button className={styles.printBtn} onClick={() => printITEOrderForm(order)}><PrinterIcon width={14} /> Print ITE Form</button>}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════
   Material Orders Tab
═══════════════════════════════════════════════════ */
const STATUS_COLOR = { draft: 'default', submitted: 'blue', delivered: 'green' };
const FORM_LABEL   = { class3: 'Class 3 Conduit', class4: 'Class 4 Conduit', trunking: 'Trunking', certis: 'Certis', 'wa-network': 'WA Network' };

function OrdersTab({ project, canAdmin, canViewCosts }) {
  const { toast }    = useToast();
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showNew,    setShowNew]    = useState(false);
  const [viewOrder,  setViewOrder]  = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'projects', project.id, 'materialOrders'))
      .then(snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))))
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false));
  }, [project.id, toast]);

  const markDelivered = async (orderId) => {
    try {
      await updateDoc(doc(db, 'projects', project.id, 'materialOrders', orderId), { status: 'delivered' });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'delivered' } : o));
      toast.success('Marked as delivered');
    } catch { toast.error('Failed to update'); }
  };

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Material Orders</h3>
          <p className={styles.sectionNote}>Generate ITE order forms and track requests to all suppliers</p>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}><PlusIcon width={14} /> New Order</Button>
      </div>

      {orders.length === 0 ? (
        <div className={styles.empty}>
          <p>No material orders yet.</p>
          <p>Create an ITE order form to request materials for site.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ref</th><th>Date</th><th>Supplier</th><th>Form</th><th>Team</th>
                {canViewCosts && <th>Total</th>}
                <th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const isITE = ['class3', 'class4', 'trunking'].includes(o.formType);
                return (
                  <tr key={o.id} className={styles.row}>
                    <td className={styles.tdBold}>{o.ref ?? '—'}</td>
                    <td>{fmtDate(o.date)}</td>
                    <td>{ALL_SUPPLIERS[o.supplier]?.shortLabel ?? o.supplier ?? '—'}</td>
                    <td>{FORM_LABEL[o.formType] ?? o.formType}</td>
                    <td>{o.team ?? '—'}</td>
                    {canViewCosts && <td className={styles.tdAmt}>{o.total ? fmt(o.total) : '—'}</td>}
                    <td><Badge color={STATUS_COLOR[o.status] ?? 'default'}>{o.status ?? 'draft'}</Badge></td>
                    <td>
                      <div className={styles.rowActions}>
                        <button className={styles.iconBtn} onClick={() => setViewOrder(o)} title="View"><EyeIcon width={14} /></button>
                        {isITE && <button className={styles.iconBtn} onClick={() => printITEOrderForm(o)} title="Print ITE form"><PrinterIcon width={14} /></button>}
                        {canAdmin && o.status === 'submitted' && (
                          <button className={styles.verifyBtn} onClick={() => markDelivered(o.id)}><CheckIcon width={12} /> Delivered</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <MaterialOrderForm
          projectId={project.id}
          onClose={() => setShowNew(false)}
          onSaved={o => setOrders(prev => [o, ...prev])}
          canViewCosts={canViewCosts}
        />
      )}
      {viewOrder && <OrderViewModal order={viewOrder} onClose={() => setViewOrder(null)} canViewCosts={canViewCosts} />}
    </>
  );
}

/* ════════════════════════════════════════════════
   Main Materials component
═══════════════════════════════════════════════════ */
const SUB_TABS = [
  { id: 'orders', label: 'Order Forms' },
  { id: 'dos',    label: 'Delivery Orders' },
];

export default function Materials({ project, userRole }) {
  const { can }        = usePermissions();
  const canAdmin      = can('materials:approve');
  const canViewCosts  = can('materials:view-costs');
  const [subTab, setSubTab] = useState('orders');

  return (
    <div className={styles.wrap}>
      <div className={styles.subTabBar}>
        {SUB_TABS.map(t => (
          <button key={t.id} className={[styles.subTab, subTab === t.id ? styles.subTabActive : ''].join(' ')} onClick={() => setSubTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'orders' && <OrdersTab project={project} canAdmin={canAdmin} canViewCosts={canViewCosts} />}
      {subTab === 'dos'    && <DeliveryOrdersTab project={project} canAdmin={canAdmin} />}
    </div>
  );
}
