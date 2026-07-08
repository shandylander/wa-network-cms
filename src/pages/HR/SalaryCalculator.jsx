import React, { useState } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import PayslipGenerator from './PayslipGenerator';
import SalaryConfig     from './SalaryConfig';
import styles from './HR.module.css';

const TAB_LABELS = { payslips: 'Payslips', config: 'Pay Config' };

export default function SalaryCalculator() {
  const { can } = usePermissions();
  const tabs = ['payslips', ...(can('salary:config') ? ['config'] : [])];
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
