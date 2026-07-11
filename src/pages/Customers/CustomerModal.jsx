import React, { useState } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { TrashIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import styles from './Customers.module.css';

const EMPTY_FORM = { name: '', contactPerson: '', phone: '', email: '', address: '', postalCode: '', notes: '' };

export default function CustomerModal({ customer, onClose, onSaved, onDeleted }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const isEdit = Boolean(customer);

  const [form, setForm] = useState(
    isEdit
      ? {
          name: customer.name ?? '', contactPerson: customer.contactPerson ?? '',
          phone: customer.phone ?? '', email: customer.email ?? '',
          address: customer.address ?? '', postalCode: customer.postalCode ?? '',
          notes: customer.notes ?? '',
        }
      : EMPTY_FORM
  );
  const [saving,      setSaving]      = useState(false);
  const [delStep,     setDelStep]     = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [linkedCount, setLinkedCount] = useState(null);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Customer name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim() };
      if (isEdit) {
        await updateDoc(doc(db, 'customers', customer.id), payload);
        toast.success('Customer updated');
        onSaved({ ...customer, ...payload });
      } else {
        const ref = await addDoc(collection(db, 'customers'), {
          ...payload,
          createdAt: Timestamp.now(),
          createdBy: userProfile.userId,
        });
        toast.success('Customer added');
        onSaved({ id: ref.id, ...payload });
      }
      onClose();
    } catch {
      toast.error('Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const startDelete = async () => {
    setDeleting(true);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), where('customerId', '==', customer.id)));
      setLinkedCount(snap.size);
      setDelStep(true);
    } catch {
      toast.error('Failed to check linked projects');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'customers', customer.id));
      toast.success(`Customer "${customer.name}" removed`);
      onDeleted(customer.id);
    } catch {
      toast.error('Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit Customer' : 'New Customer'} size="md">
      <div className={styles.formGrid}>
        <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
          <label className={styles.label} htmlFor="cust-name">Company / Customer Name *</label>
          <input id="cust-name" className={styles.input} value={form.name} onChange={set('name')} placeholder="e.g. Certis Technology (S) Pte Ltd" autoFocus />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="cust-contactPerson">Contact Person</label>
          <input id="cust-contactPerson" className={styles.input} value={form.contactPerson} onChange={set('contactPerson')} placeholder="e.g. John Tan" />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="cust-phone">Phone</label>
          <input id="cust-phone" className={styles.input} value={form.phone} onChange={set('phone')} placeholder="e.g. 9123 4567" />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="cust-email">Email</label>
          <input id="cust-email" type="email" className={styles.input} value={form.email} onChange={set('email')} placeholder="e.g. john@certis.com" />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="cust-address">Address</label>
          <input id="cust-address" className={styles.input} value={form.address} onChange={set('address')} placeholder="Billing / correspondence address" />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="cust-postalCode">Postal Code</label>
          <input id="cust-postalCode" className={styles.input} value={form.postalCode} onChange={set('postalCode')} placeholder="e.g. 757515" />
        </div>
        <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
          <label className={styles.label} htmlFor="cust-notes">Notes <span className={styles.opt}>(optional)</span></label>
          <textarea id="cust-notes" className={styles.textarea} rows={3} value={form.notes} onChange={set('notes')}
            placeholder="Warranty terms, special arrangements, anything worth remembering about this customer" />
        </div>
      </div>

      {isEdit && (
        <div className={styles.deleteZone}>
          {!delStep ? (
            <button className={styles.deleteLink} onClick={startDelete} disabled={deleting}>
              <TrashIcon width={14} /> Delete this customer
            </button>
          ) : linkedCount > 0 ? (
            <p className={styles.deleteBlocked}>
              Cannot delete — {linkedCount} project{linkedCount !== 1 ? 's are' : ' is'} still linked to this customer.
            </p>
          ) : (
            <div className={styles.deleteConfirm}>
              <p>Delete "{customer.name}" permanently? This cannot be undone.</p>
              <Button variant="danger" size="sm" onClick={confirmDelete} loading={deleting}>Yes, delete it</Button>
              <Button variant="secondary" size="sm" onClick={() => setDelStep(false)}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>{isEdit ? 'Save Changes' : 'Add Customer'}</Button>
      </div>
    </Modal>
  );
}
