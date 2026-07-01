import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, setDoc, doc, Timestamp } from 'firebase/firestore';
import { PlusIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fmtSGD } from '../../utils/salaryUtils';
import styles from './HR.module.css';

const DEFAULT_CONFIG = { basicPay: 0, standardDailyHours: 8, otMultiplier: 1.5, cpfApplicable: false, allowances: [], otherDeductions: [] };

export default function SalaryConfig() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // userId being edited
  const [form,    setForm]    = useState(DEFAULT_CONFIG);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [userSnap, cfgSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
          getDocs(collection(db, 'salaryConfig')),
        ]);
        const cfgMap = {};
        cfgSnap.docs.forEach(d => { cfgMap[d.id] = d.data(); });
        const rows = userSnap.docs.map(d => d.data())
          .filter(u => ['staff','supervisor','manager'].includes(u.role))
          .map(u => ({ ...u, config: cfgMap[u.userId] ?? DEFAULT_CONFIG }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setStaff(rows);
      } catch { toast.error('Failed to load'); }
      finally { setLoading(false); }
    };
    load();
  }, [toast]);

  const openEdit = (s) => {
    setSelected(s.userId);
    setForm({ ...DEFAULT_CONFIG, ...s.config });
  };

  const addAllowance = () => setForm(f => ({ ...f, allowances: [...(f.allowances ?? []), { id: Date.now().toString(), name: '', amount: 0 }] }));
  const removeAllowance = (id) => setForm(f => ({ ...f, allowances: f.allowances.filter(a => a.id !== id) }));
  const updateAllowance = (id, field, val) => setForm(f => ({ ...f, allowances: f.allowances.map(a => a.id === id ? { ...a, [field]: field === 'amount' ? parseFloat(val)||0 : val } : a) }));

  const addDeduction = () => setForm(f => ({ ...f, otherDeductions: [...(f.otherDeductions ?? []), { id: Date.now().toString(), name: '', amount: 0 }] }));
  const removeDeduction = (id) => setForm(f => ({ ...f, otherDeductions: f.otherDeductions.filter(d => d.id !== id) }));
  const updateDeduction = (id, field, val) => setForm(f => ({ ...f, otherDeductions: f.otherDeductions.map(d => d.id === id ? { ...d, [field]: field === 'amount' ? parseFloat(val)||0 : val } : d) }));

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const s = staff.find(x => x.userId === selected);
      await setDoc(doc(db, 'salaryConfig', selected), {
        ...form,
        basicPay: parseFloat(form.basicPay) || 0,
        standardDailyHours: parseFloat(form.standardDailyHours) || 8,
        otMultiplier: parseFloat(form.otMultiplier) || 1.5,
        userId: selected, name: s?.name ?? '',
        updatedBy: userProfile.userId, updatedAt: Timestamp.now(),
      }, { merge: true });
      setStaff(prev => prev.map(x => x.userId === selected ? { ...x, config: { ...form } } : x));
      toast.success(`Saved config for ${s?.name}`);
      setSelected(null);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  const ROLE_LBL = { staff: 'Staff', supervisor: 'Supervisor', manager: 'Manager' };

  return (
    <div className={styles.salaryConfigWrap}>
      <div className={styles.cfgGrid}>
        {/* Staff list */}
        <div className={styles.cfgList}>
          <p className={styles.cfgListTitle}>Select staff to configure</p>
          {staff.map(s => (
            <button key={s.userId}
              className={[styles.cfgStaffRow, selected === s.userId ? styles.cfgStaffRowActive : ''].join(' ')}
              onClick={() => openEdit(s)}>
              <div className={styles.cfgStaffInfo}>
                <p className={styles.cfgStaffName}>{s.name}</p>
                <p className={styles.cfgStaffRole}>{ROLE_LBL[s.role] ?? s.role}</p>
              </div>
              <p className={styles.cfgBasicPay}>{fmtSGD(s.config?.basicPay ?? 0)}</p>
            </button>
          ))}
        </div>

        {/* Edit form */}
        {selected ? (
          <div className={styles.cfgForm}>
            <p className={styles.cfgFormTitle}>{staff.find(s => s.userId === selected)?.name}</p>

            <div className={styles.cfgRow}>
              <label className={styles.cfgLbl}>Basic Pay ($/month)</label>
              <input type="number" min="0" className={styles.cfgInput}
                value={form.basicPay} onChange={e => setForm(f => ({ ...f, basicPay: e.target.value }))} />
            </div>
            <div className={styles.cfgRowGroup}>
              <div className={styles.cfgRow}>
                <label className={styles.cfgLbl}>Standard hours/day</label>
                <input type="number" min="1" max="24" className={styles.cfgInput}
                  value={form.standardDailyHours} onChange={e => setForm(f => ({ ...f, standardDailyHours: e.target.value }))} />
              </div>
              <div className={styles.cfgRow}>
                <label className={styles.cfgLbl}>OT multiplier</label>
                <input type="number" min="1" step="0.25" className={styles.cfgInput}
                  value={form.otMultiplier} onChange={e => setForm(f => ({ ...f, otMultiplier: e.target.value }))} />
              </div>
            </div>
            <label className={styles.cfgCheck}>
              <input type="checkbox" checked={form.cpfApplicable}
                onChange={e => setForm(f => ({ ...f, cpfApplicable: e.target.checked }))} />
              CPF applicable (citizen / PR)
            </label>

            {/* Allowances */}
            <div className={styles.cfgSection}>
              <div className={styles.cfgSectionHead}>
                <p className={styles.cfgSectionTitle}>Recurring Allowances</p>
                <button className={styles.cfgAddBtn} onClick={addAllowance}><PlusIcon width={13} /> Add</button>
              </div>
              {(form.allowances ?? []).map(a => (
                <div key={a.id} className={styles.cfgItemRow}>
                  <input className={styles.cfgItemInput} placeholder="Name (e.g. Transport)" value={a.name}
                    onChange={e => updateAllowance(a.id, 'name', e.target.value)} />
                  <input className={styles.cfgItemAmt} type="number" min="0" placeholder="0.00" value={a.amount}
                    onChange={e => updateAllowance(a.id, 'amount', e.target.value)} />
                  <button className={styles.cfgRemoveBtn} onClick={() => removeAllowance(a.id)}><TrashIcon width={13} /></button>
                </div>
              ))}
            </div>

            {/* Deductions */}
            <div className={styles.cfgSection}>
              <div className={styles.cfgSectionHead}>
                <p className={styles.cfgSectionTitle}>Fixed Deductions</p>
                <button className={styles.cfgAddBtn} onClick={addDeduction}><PlusIcon width={13} /> Add</button>
              </div>
              {(form.otherDeductions ?? []).map(d => (
                <div key={d.id} className={styles.cfgItemRow}>
                  <input className={styles.cfgItemInput} placeholder="Name (e.g. Accommodation)" value={d.name}
                    onChange={e => updateDeduction(d.id, 'name', e.target.value)} />
                  <input className={styles.cfgItemAmt} type="number" min="0" placeholder="0.00" value={d.amount}
                    onChange={e => updateDeduction(d.id, 'amount', e.target.value)} />
                  <button className={styles.cfgRemoveBtn} onClick={() => removeDeduction(d.id)}><TrashIcon width={13} /></button>
                </div>
              ))}
            </div>

            <div className={styles.cfgActions}>
              <button className={styles.cancelBtn} onClick={() => setSelected(null)}>Cancel</button>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                <CheckIcon width={14} /> {saving ? 'Saving…' : 'Save Config'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.cfgPlaceholder}>Select a staff member to configure their pay package.</div>
        )}
      </div>
    </div>
  );
}
