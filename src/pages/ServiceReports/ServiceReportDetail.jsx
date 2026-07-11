import React from 'react';
import { PrinterIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import { formatDate } from '../../utils/helpers';
import styles from './ServiceReports.module.css';

const EQUIPMENT_LABELS = { cctv: 'CCTV', doorAccess: 'Door Access', network: 'Network', others: 'Others' };
const JOB_LABELS = {
  maintenance: 'Maintenance', housecall: 'Housecall', delivery: 'Delivery',
  installation: 'Installation', testing: 'Testing and Commissioning', others: 'Others',
};
const BILLING_LABELS = {
  contract: 'As per existing subscribed Support Contract',
  estimate: 'Refer to Sales Estimate',
  cash: 'Cash Collection',
};

function fmtChecks(values, labels, otherKey, report) {
  if (!values?.length) return '—';
  return values.map(v => v === 'others' && report[otherKey] ? `Others (${report[otherKey]})` : labels[v] ?? v).join(', ');
}

export default function ServiceReportDetail({ report, onClose }) {
  return (
    <Modal isOpen onClose={onClose} title="Service Report" size="xl">
      <div className={styles.printArea}>
        <div className={styles.printHead}>
          <h1 className={styles.printTitle}>Service Report</h1>
          <div className={styles.printCompany}>
            <strong>WA! NETWORK ASIA</strong><br />
            Tel: (65) 6966 7034 · Mobile: (65) 9729 4378<br />
            Email: andy.ng@wanetwork.asia<br />
            186 Woodlands Industrial Park E5 #04-01L S757515
          </div>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Customer Details</div>
          <div className={styles.printGrid}>
            <div className={styles.printRow}><span className={styles.printKey}>Company:</span><span className={styles.printVal}>{report.customerName}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Customer:</span><span className={styles.printVal}>{report.contactName || '—'}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Address:</span><span className={styles.printVal}>{report.address || '—'}{report.postalCode ? ` (${report.postalCode})` : ''}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Contact No.:</span><span className={styles.printVal}>{report.contactNo || '—'}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Email:</span><span className={styles.printVal}>{report.email || '—'}</span></div>
            {report.projectName && (
              <div className={styles.printRow}><span className={styles.printKey}>Project:</span><span className={styles.printVal}>{report.projectName}</span></div>
            )}
          </div>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Type of Service</div>
          <p className={styles.printText}>{fmtChecks(report.equipmentTypes, EQUIPMENT_LABELS, 'equipmentOther', report)}</p>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Job Details</div>
          <p className={styles.printText}>{fmtChecks(report.jobTypes, JOB_LABELS, 'jobOther', report)}</p>
          <p className={styles.printText} style={{ marginTop: 6 }}>{report.jobDescription}</p>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Action Taken</div>
          <p className={styles.printText}>{report.actionTaken}</p>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Charges Payable</div>
          <div className={styles.printGrid}>
            <div className={styles.printRow}><span className={styles.printKey}>Chargeable:</span><span className={styles.printVal}>{report.chargeable === 'yes' ? 'Yes' : report.chargeable === 'no' ? 'No' : '—'}</span></div>
            {report.chargeable === 'yes' && (
              <div className={styles.printRow}>
                <span className={styles.printKey}>Basis:</span>
                <span className={styles.printVal}>
                  {BILLING_LABELS[report.billingBasis] ?? '—'}
                  {report.billingBasis === 'estimate' && report.salesEstimateNo ? ` #${report.salesEstimateNo}` : ''}
                  {report.billingBasis === 'cash' && report.cashAmount != null ? ` — $${Number(report.cashAmount).toFixed(2)}` : ''}
                </span>
              </div>
            )}
            <div className={styles.printRow}><span className={styles.printKey}>Follow-up:</span><span className={styles.printVal}>{report.followUpRequired === 'yes' ? 'Yes' : report.followUpRequired === 'no' ? 'No' : '—'}</span></div>
          </div>
          {report.remarks && <p className={styles.printText} style={{ marginTop: 6 }}>{report.remarks}</p>}
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Visit Details</div>
          <div className={styles.printGrid}>
            <div className={styles.printRow}><span className={styles.printKey}>Date:</span><span className={styles.printVal}>{report.visitDate}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Arrival:</span><span className={styles.printVal}>{report.arrivalTime || '—'}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Departure:</span><span className={styles.printVal}>{report.departureTime || '—'}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Attended By:</span><span className={styles.printVal}>{report.attendedBy}</span></div>
            {report.invoiceNo && (
              <div className={styles.printRow}><span className={styles.printKey}>Invoice No.:</span><span className={styles.printVal}>{report.invoiceNo}</span></div>
            )}
          </div>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Customer Signature</div>
          <div className={styles.sigBlock}>
            {report.signatureUrl && <img src={report.signatureUrl} alt="Customer signature" className={styles.sigImg} />}
            <div className={styles.sigMeta}>
              {report.signerName}<br />
              {formatDate(report.signedAt)}
            </div>
          </div>
        </div>
      </div>

      <div className={[styles.detailActions, styles.printHide].join(' ')}>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => window.print()}>
          <PrinterIcon width={15} style={{ marginRight: 6 }} /> Print / Save as PDF
        </Button>
      </div>
    </Modal>
  );
}
