import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
  ArrowLeftIcon, PencilIcon, PhoneIcon, EnvelopeIcon,
  MapPinIcon, UserIcon, FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/helpers';
import Badge from '../../components/UI/Badge';
import Card, { CardHeader } from '../../components/UI/Card';
import CustomerModal from './CustomerModal';
import CustomerDocuments from './CustomerDocuments';
import JobList from '../Jobs/JobList';
import styles from './Customers.module.css';

const STATUS_COLOR = { active: 'green', upcoming: 'amber', completed: 'default' };

export default function CustomerDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { toast }  = useToast();
  const { can }    = usePermissions();
  const [customer, setCustomer] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);

  const canManage = can('manage:customers');

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    const load = async () => {
      try {
        const [custSnap, projSnap] = await Promise.all([
          getDoc(doc(db, 'customers', id)),
          getDocs(query(collection(db, 'projects'), where('customerId', '==', id))),
        ]);
        if (!custSnap.exists()) { navigate('/customers'); return; }
        setCustomer({ id: custSnap.id, ...custSnap.data() });
        setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        toast.error('Failed to load customer');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, canManage, navigate, toast]);

  if (!canManage) {
    return <p className={styles.empty}>You don't have access to this page.</p>;
  }

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;
  if (!customer) return null;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/customers')}>
        <ArrowLeftIcon width={14} /> Customers
      </button>

      <div className={styles.detailHeader}>
        <h1 className={styles.title}>{customer.name}</h1>
        <button className={styles.editBtn} onClick={() => setEditing(true)}>
          <PencilIcon width={13} /> Edit
        </button>
      </div>

      <Card>
        <CardHeader title="Contact Details" />
        <div className={styles.contactList}>
          {customer.contactPerson && (
            <div className={styles.contactRow}><UserIcon width={15} /> {customer.contactPerson}</div>
          )}
          {customer.phone && (
            <div className={styles.contactRow}><PhoneIcon width={15} /> {customer.phone}</div>
          )}
          {customer.email && (
            <div className={styles.contactRow}><EnvelopeIcon width={15} /> {customer.email}</div>
          )}
          {customer.address && (
            <div className={styles.contactRow}><MapPinIcon width={15} /> {customer.address}{customer.postalCode ? ` (${customer.postalCode})` : ''}</div>
          )}
          {!customer.contactPerson && !customer.phone && !customer.email && !customer.address && (
            <p className={styles.noContact}>No contact details on file.</p>
          )}
        </div>
        {customer.notes && (
          <div className={styles.notesBox}>
            <p className={styles.notesLabel}>Notes</p>
            <p className={styles.notesText}>{customer.notes}</p>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 16 }}>
        <CardHeader title="Projects" subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''} for this customer`} />
        {projects.length === 0 ? (
          <div className={styles.emptyProjects}>
            <FolderOpenIcon width={32} />
            <p>No projects linked to this customer yet.</p>
          </div>
        ) : (
          <div className={styles.projList}>
            {projects.map(p => (
              <div key={p.id} className={styles.projRow} onClick={() => navigate(`/projects/${p.id}`)}>
                <div>
                  <p className={styles.projName}>{p.name}</p>
                  <p className={styles.projMeta}>{p.type}{p.location ? ` · ${p.location}` : ''}{p.startDate ? ` · Started ${formatDate(p.startDate)}` : ''}</p>
                </div>
                <Badge color={STATUS_COLOR[p.status] ?? 'default'}>{p.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 16 }}>
        <CardHeader title="Documents" subtitle="Floorplans, drawings and technical docs for this customer's site" />
        <CustomerDocuments customer={customer} />
      </Card>

      {(can('manage:service-reports') || can('jobs:assign')) && (
        <Card style={{ marginTop: 16 }}>
          <CardHeader title="Service Jobs" subtitle="Scheduled visits and post-visit reports across all this customer's projects" />
          <JobList customerId={customer.id} customerName={customer.name} showProjectColumn />
        </Card>
      )}

      {editing && (
        <CustomerModal
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={(saved) => setCustomer(saved)}
          onDeleted={() => navigate('/customers')}
        />
      )}
    </div>
  );
}
