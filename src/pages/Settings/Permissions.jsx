import React from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon } from '@heroicons/react/24/solid';
import { useAccessLevels } from '../../hooks/useAccessLevels';
import { PERMISSION_CATALOG, PERMISSION_AREAS } from '../../utils/permissionCatalog';
import styles from './Permissions.module.css';

// Live matrix — rows are real permission keys from permissionCatalog.js,
// columns are your actual Access Levels (Settings → Access Levels), cells
// reflect real data instead of the old hardcoded, disconnected table.
export default function Permissions() {
  const { levels, loading } = useAccessLevels();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Permission Matrix</h2>
        <p className={styles.sub}>
          Live view of what each Access Level grants. Manage levels in{' '}
          <Link to="/settings/access-levels">Settings → Access Levels</Link>.
        </p>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}><CheckIcon className={styles.checkIcon} /> Included in this level</span>
      </div>

      {loading ? (
        <div className={styles.loadingWrap}><div className={styles.spinner} /></div>
      ) : levels.length === 0 ? (
        <p className={styles.empty}>No access levels yet — create one in Settings → Access Levels.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.featureHead}>Permission</th>
                {levels.map((l) => (
                  <th key={l.id} className={styles.levelHead}>
                    <span className={styles.levelDot} style={{ background: l.color }} />
                    {l.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_AREAS.map((area) => (
                <React.Fragment key={area}>
                  <tr className={styles.groupRow}>
                    <td colSpan={levels.length + 1} className={styles.groupCell}>{area}</td>
                  </tr>
                  {PERMISSION_CATALOG.filter((p) => p.area === area).map((perm) => (
                    <tr key={perm.key} className={styles.dataRow}>
                      <td className={styles.featureCell}>{perm.label}</td>
                      {levels.map((l) => (
                        <td key={l.id} className={(l.permissions ?? []).includes(perm.key) ? styles.cellFull : styles.cellNone}>
                          {(l.permissions ?? []).includes(perm.key) && <CheckIcon className={styles.checkIcon} />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
