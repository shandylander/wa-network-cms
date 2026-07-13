import {
  certExpiryAlerts,
  vetQueueAlerts,
  leaveClashAlerts,
  claimsAgingAlerts,
  cpfDeadlineAlert,
  buildAttentionFeed,
} from './attentionEngine';

// Fixed reference "now" so day-math is deterministic.
const NOW = new Date('2026-07-13T02:00:00Z'); // 10:00 SGT
const isoInDays = (d) => new Date(NOW.getTime() + d * 86400000).toISOString().slice(0, 10);

describe('certExpiryAlerts', () => {
  test('flags a cert expiring within the window as a warning', () => {
    const workers = [{ id: 'w1', name: 'Ali', certs: [{ name: 'WAH', expiry: isoInDays(10) }] }];
    const out = certExpiryAlerts(workers, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].to).toBe('/workers');
  });

  test('an already-expired cert is critical', () => {
    const workers = [{ id: 'w1', name: 'Ali', certs: [{ name: 'WAH', expiry: isoInDays(-3) }] }];
    expect(certExpiryAlerts(workers, { now: NOW })[0].severity).toBe('critical');
  });

  test('ignores certs beyond the window and workers with none', () => {
    const workers = [
      { id: 'w1', name: 'Far', certs: [{ name: 'WAH', expiry: isoInDays(90) }] },
      { id: 'w2', name: 'None', certs: [] },
    ];
    expect(certExpiryAlerts(workers, { now: NOW })).toHaveLength(0);
  });

  test('aggregates multiple expiring certs into one row with +N more', () => {
    const workers = [{ id: 'w1', name: 'Ali', certs: [
      { name: 'WAH', expiry: isoInDays(5) },
      { name: 'First Aid', expiry: isoInDays(20) },
    ] }];
    const out = certExpiryAlerts(workers, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].detail).toContain('+1 more');
  });
});

describe('vetQueueAlerts', () => {
  test('completed job older than staleDays warns; only completed status counts', () => {
    const jobs = [
      { id: 'j1', status: 'completed', customerName: 'Acme', createdAt: new Date(NOW.getTime() - 3 * 86400000) },
      { id: 'j2', status: 'in-progress', createdAt: new Date(NOW.getTime() - 9 * 86400000) },
    ];
    const out = vetQueueAlerts(jobs, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('vet-j1');
    expect(out[0].severity).toBe('warning');
  });

  test('a week-old completed job is critical; fresh one is ignored', () => {
    const jobs = [
      { id: 'j1', status: 'completed', createdAt: new Date(NOW.getTime() - 8 * 86400000) },
      { id: 'j2', status: 'completed', createdAt: new Date(NOW.getTime() - 1 * 86400000) },
    ];
    const out = vetQueueAlerts(jobs, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('critical');
  });
});

describe('leaveClashAlerts', () => {
  const jobs = [{ id: 'j1', scheduledDate: '2026-07-20', assignedTo: ['WK001'], assignedToNames: ['Ali'] }];

  test('approved leave covering a scheduled job for the same user clashes', () => {
    const leave = [{ id: 'l1', userId: 'WK001', name: 'Ali', type: 'AL', status: 'approved', dateFrom: '2026-07-18', dateTo: '2026-07-22' }];
    const out = leaveClashAlerts(leave, jobs);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('critical');
  });

  test('no clash when the user is not assigned to the job', () => {
    const leave = [{ id: 'l1', userId: 'WK999', name: 'Bob', status: 'approved', dateFrom: '2026-07-18', dateTo: '2026-07-22' }];
    expect(leaveClashAlerts(leave, jobs)).toHaveLength(0);
  });

  test('no clash when the job date is outside the leave range', () => {
    const leave = [{ id: 'l1', userId: 'WK001', name: 'Ali', status: 'approved', dateFrom: '2026-07-01', dateTo: '2026-07-05' }];
    expect(leaveClashAlerts(leave, jobs)).toHaveLength(0);
  });

  test('pending (not approved) leave does not clash', () => {
    const leave = [{ id: 'l1', userId: 'WK001', name: 'Ali', status: 'pending', dateFrom: '2026-07-18', dateTo: '2026-07-22' }];
    expect(leaveClashAlerts(leave, jobs)).toHaveLength(0);
  });
});

describe('claimsAgingAlerts', () => {
  test('rolls unpaid aged claims into one warning with the outstanding total', () => {
    const claims = [
      { id: 'c1', status: 'submitted', netAmount: 1500, createdAt: new Date(NOW.getTime() - 40 * 86400000) },
      { id: 'c2', status: 'approved',  netAmount: 3000, createdAt: new Date(NOW.getTime() - 35 * 86400000) },
      { id: 'c3', status: 'paid',      netAmount: 9999, createdAt: new Date(NOW.getTime() - 99 * 86400000) },
      { id: 'c4', status: 'submitted', netAmount: 500,  createdAt: new Date(NOW.getTime() - 5 * 86400000) },
    ];
    const out = claimsAgingAlerts(claims, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].detail).toContain('4,500'); // c1 + c2, paid + recent excluded
  });

  test('no alert when nothing is aged', () => {
    const claims = [{ id: 'c1', status: 'submitted', netAmount: 100, createdAt: NOW }];
    expect(claimsAgingAlerts(claims, { now: NOW })).toHaveLength(0);
  });
});

describe('cpfDeadlineAlert', () => {
  test('shows within the 7th–14th window', () => {
    expect(cpfDeadlineAlert(new Date('2026-07-13T02:00:00Z'))).toHaveLength(1);
  });
  test('hidden outside the window', () => {
    expect(cpfDeadlineAlert(new Date('2026-07-03T02:00:00Z'))).toHaveLength(0);
    expect(cpfDeadlineAlert(new Date('2026-07-20T02:00:00Z'))).toHaveLength(0);
  });
});

describe('buildAttentionFeed', () => {
  test('sorts critical before warning before info', () => {
    const workers = [{ id: 'w1', name: 'Ali', certs: [{ name: 'WAH', expiry: isoInDays(-1) }] }]; // critical
    const claims = [{ id: 'c1', status: 'submitted', netAmount: 100, createdAt: new Date(NOW.getTime() - 40 * 86400000) }]; // warning
    const feed = buildAttentionFeed({ workers, claims, now: NOW, includeCpf: true }); // + cpf info
    const sev = feed.map(i => i.severity);
    expect(sev[0]).toBe('critical');
    expect(sev[sev.length - 1]).toBe('info');
    // still sorted: no info before a warning
    expect(sev.indexOf('info')).toBeGreaterThan(sev.indexOf('warning'));
  });

  test('includeCpf:false suppresses the CPF reminder', () => {
    const feed = buildAttentionFeed({ now: new Date('2026-07-13T02:00:00Z'), includeCpf: false });
    expect(feed.find(i => i.id === 'cpf-deadline')).toBeUndefined();
  });
});
