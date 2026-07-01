import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PayslipGenerator from './PayslipGenerator';
import SalaryConfig     from './SalaryConfig';
import styles from './HR.module.css';

const TABS = {
  owner:      ['payslips', 'config'],
  manager:    ['payslips', 'config'],
  supervisor: ['payslips'],
  staff:      ['payslips'],
};

const TAB_LABELS = { payslips: 'Payslips', config: 'Pay Config' };

export default function SalaryCalculator() {
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? 'staff';
  const tabs = TABS[role] ?? ['payslips'];
  const [active, setActive] = useState(tabs[0]);

  return (
    <div className={styles.page}>
      {tabs.length > 1 && (
        <div className={styles.tabBar}>
          {tabs.map(t => (
            <button key={t}
              className={[styles.tab, active === t ? styles.tabActive : ''].join(' ')}
              onClick={() => setActive(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      )}
      <div className={styles.content}>
        {active === 'payslips' && <PayslipGenerator />}
        {active === 'config'   && <SalaryConfig />}
      </div>
    </div>
  );
}
