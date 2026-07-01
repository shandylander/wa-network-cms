import React, { useState, useMemo } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { PrinterIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ITE_FORMS, OTHER_SUPPLIERS, fmtSGD } from '../../utils/materialData';
import { printITEOrderForm } from '../../utils/printITEForm';
import { todayInputSG } from '../../utils/helpers';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import styles from './Materials.module.css';

const todayISO = todayInputSG;
const nextRef   = () => `WAN-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

const FORM_TABS = [
  { id: 'class3',     label: 'Class 3 Conduit', group: 'ite' },
  { id: 'class4',     label: 'Class 4 Conduit', group: 'ite' },
  { id: 'trunking',   label: 'Trunking',         group: 'ite' },
  { id: 'certis',     label: 'Certis',            group: 'other' },
  { id: 'wa-network', label: 'WA Network',        group: 'other' },
];

/* ── ITE order form (pre-loaded items, qty entry) ── */
function ITEOrderForm({ formType, projectId, onClose, onSaved, canViewCosts }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const config          = ITE_FORMS[formType];
  const allItems        = useMemo(() => config.sections.flatMap(s => s.items), [config]);

  const [ref,      setRef]      = useState(nextRef);
  const [date,     setDate]     = useState(todayISO);
  const [contact,  setContact]  = useState('');
  const [address,  setAddress]  = useState('');
  const [notes,    setNotes]    = useState('');
  const [qty,      setQty]      = useState({});
  const [saving,   setSaving]   = useState(false);

  const setQ = (id, val) => setQty(q => ({ ...q, [id]: val === '' ? '' : Math.max(0, Number(val)) }));

  const total = useMemo(() => allItems.reduce((s, it) => {
    const q = Number(qty[it.id] ?? 0);
    return s + (q > 0 ? q * it.unitPrice : 0);
  }, 0), [allItems, qty]);

  const hasQty = allItems.some(it => Number(qty[it.id] ?? 0) > 0);

  const handleSave = async (status = 'draft') => {
    if (!hasQty) { toast.error('Enter quantity for at least one item'); return; }
    setSaving(true);
    try {
      const payload = {
        supplier: 'ite', formType, ref, date,
        quantities: qty,
        siteContact: contact, deliveryAddress: address, notes,
        total, status,
        createdAt: new Date(), createdBy: userProfile.userId,
        team: userProfile.team ?? '',
      };
      const docRef = await addDoc(collection(db, 'projects', projectId, 'materialOrders'), payload);
      onSaved({ id: docRef.id, ...payload });
      toast.success(status === 'submitted' ? 'Order submitted' : 'Draft saved');
      onClose();
    } catch { toast.error('Failed to save order'); }
    finally   { setSaving(false); }
  };

  const handlePrint = () => {
    printITEOrderForm({ formType, ref, date, quantities: qty, siteContact: contact, deliveryAddress: address });
  };

  return (
    <>
      <div className={styles.orderMeta}>
        <div className={styles.metaField}>
          <label className={styles.label}>REF</label>
          <input className={styles.input} value={ref} onChange={e => setRef(e.target.value)} />
        </div>
        <div className={styles.metaField}>
          <label className={styles.label}>DATE</label>
          <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className={styles.metaField}>
          <label className={styles.label}>Site Contact</label>
          <input className={styles.input} value={contact} onChange={e => setContact(e.target.value)} placeholder="Name / phone" />
        </div>
        <div className={styles.metaField}>
          <label className={styles.label}>Delivery Address</label>
          <input className={styles.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Block / site address" />
        </div>
      </div>

      {/* Item list per section */}
      {config.sections.map(section => (
        <div key={section.header} className={styles.itemSection}>
          <div className={styles.sectionBand}>{section.header}</div>
          <div className={styles.itemGrid}>
            <div className={[styles.itemGridHead, canViewCosts ? '' : styles.itemGridHeadSlim].join(' ')}>
              <span>S/No</span><span>Description</span>
              {canViewCosts && <span>Unit Price</span>}
              <span>Qty</span>
              {canViewCosts && <span>Amount</span>}
            </div>
            {section.items.map(item => {
              const q   = Number(qty[item.id] ?? 0);
              const amt = q > 0 ? q * item.unitPrice : 0;
              return (
                <div key={item.id} className={[styles.itemGridRow, canViewCosts ? '' : styles.itemGridRowSlim, q > 0 ? styles.itemActive : ''].join(' ')}>
                  <span className={styles.itemSno}>{item.sno}</span>
                  <span className={styles.itemDesc}>{item.desc}</span>
                  {canViewCosts && <span className={styles.itemPrice}>{fmtSGD(item.unitPrice)}</span>}
                  <input
                    type="number" min="0" step="1"
                    className={styles.itemQtyInput}
                    value={qty[item.id] ?? ''}
                    onChange={e => setQ(item.id, e.target.value)}
                    placeholder="0"
                  />
                  {canViewCosts && <span className={styles.itemAmt}>{amt > 0 ? fmtSGD(amt) : '—'}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {canViewCosts && (
        <div className={styles.orderTotal}>
          <span>Estimated Total</span>
          <strong>{fmtSGD(total)}</strong>
        </div>
      )}

      <div className={styles.field} style={{ marginTop: 12 }}>
        <label className={styles.label}>Notes</label>
        <textarea className={styles.textarea} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions…" />
      </div>

      <div className={styles.orderFooter}>
        <button className={styles.printBtn} onClick={handlePrint} disabled={!hasQty} title="Preview & print the ITE order form">
          <PrinterIcon width={14} /> Preview & Print
        </button>
        <div className={styles.footerBtns}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSave('draft')} loading={saving}>Save Draft</Button>
          <Button onClick={() => handleSave('submitted')} loading={saving}>Submit Order</Button>
        </div>
      </div>
    </>
  );
}

/* ── Simple form for Certis / WA Network ── */
function SimpleOrderForm({ supplierId, projectId, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const config          = OTHER_SUPPLIERS[supplierId];
  const [date,    setDate]   = useState(todayISO);
  const [notes,   setNotes]  = useState('');
  const [qty,     setQty]    = useState({});
  const [saving,  setSaving] = useState(false);

  const setQ = (id, val) => setQty(q => ({ ...q, [id]: val }));
  const hasQty = config.items.some(it => Number(qty[it.id] ?? 0) > 0);

  const handleSave = async () => {
    if (!hasQty) { toast.error('Enter quantity for at least one item'); return; }
    setSaving(true);
    try {
      const items = config.items.filter(it => Number(qty[it.id] ?? 0) > 0)
        .map(it => ({ desc: it.desc, qty: Number(qty[it.id]), unit: it.unit }));
      const payload = {
        supplier: supplierId, formType: supplierId, ref: nextRef(), date,
        items, notes, status: 'submitted',
        total: 0,
        createdAt: new Date(), createdBy: userProfile.userId, team: userProfile.team ?? '',
      };
      const docRef = await addDoc(collection(db, 'projects', projectId, 'materialOrders'), payload);
      onSaved({ id: docRef.id, ...payload });
      toast.success('Request saved');
      onClose();
    } catch { toast.error('Failed to save'); }
    finally   { setSaving(false); }
  };

  return (
    <>
      <div className={styles.orderMeta}>
        <div className={styles.metaField}>
          <label className={styles.label}>Date</label>
          <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div className={styles.itemSection}>
        <div className={styles.sectionBand}>{config.label}</div>
        {config.items.map(item => (
          <div key={item.id} className={styles.simpleItemRow}>
            <span className={styles.itemDesc}>{item.desc}</span>
            <span className={styles.itemUnit}>{item.unit}</span>
            <input type="number" min="0" className={styles.itemQtyInput} value={qty[item.id] ?? ''} onChange={e => setQ(item.id, e.target.value)} placeholder="0" />
          </div>
        ))}
      </div>
      <div className={styles.field} style={{ marginTop: 12 }}>
        <label className={styles.label}>Notes</label>
        <textarea className={styles.textarea} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. urgent, deliver to Block 312…" />
      </div>
      <div className={styles.orderFooter}>
        <div />
        <div className={styles.footerBtns}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save Request</Button>
        </div>
      </div>
    </>
  );
}

/* ── Main modal wrapper ── */
export default function MaterialOrderForm({ projectId, onClose, onSaved, canViewCosts }) {
  const [activeTab, setActiveTab] = useState('class3');
  const isITE = ['class3', 'class4', 'trunking'].includes(activeTab);

  return (
    <Modal isOpen onClose={onClose} title="New Material Order" size="xl">
      <div className={styles.formTabBar}>
        {FORM_TABS.map(t => (
          <button
            key={t.id}
            className={[styles.formTab, activeTab === t.id ? styles.formTabActive : '', t.group === 'ite' ? styles.formTabITE : styles.formTabOther].join(' ')}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.formBody}>
        {isITE ? (
          <ITEOrderForm key={activeTab} formType={activeTab} projectId={projectId} onClose={onClose} onSaved={onSaved} canViewCosts={canViewCosts} />
        ) : (
          <SimpleOrderForm key={activeTab} supplierId={activeTab} projectId={projectId} onClose={onClose} onSaved={onSaved} />
        )}
      </div>
    </Modal>
  );
}
