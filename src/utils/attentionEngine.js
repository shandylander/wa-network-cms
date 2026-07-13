// Attention Engine — pure alert detectors for the dashboard "Needs Attention"
// feed. Every function here takes ALREADY-FETCHED arrays and returns plain
// alert items; nothing in this file talks to Firestore. Callers (Home.jsx)
// are responsible for fetching only the data the current user is permitted to
// see and passing it in, so permission gating lives with the caller, not here.
//
// Alert item shape:
//   { id, severity: 'critical'|'warning'|'info', title, detail, to }
//   `to` is a react-router path used to deep-link the row on click.

const DAY_MS = 86400000;

// Normalise a Firestore Timestamp | {seconds} | ISO string | Date into a Date.
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmtMoney = (n) => `$${Number(n ?? 0).toLocaleString('en-SG', { maximumFractionDigits: 0 })}`;

/**
 * Workers holding a certificate that has expired or expires within N days.
 * Reuses Home.jsx's original day-count logic: days = floor((expiry - now)/day).
 * One aggregated item per worker (soonest cert + "+N more"), so the feed stays
 * scannable. Expired → critical, still-valid-but-soon → warning.
 * @returns {Array<{id,severity,title,detail,to}>}
 */
export function certExpiryAlerts(workers = [], { withinDays = 30, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const out = [];
  workers.forEach((w) => {
    const expiring = (w.certs ?? [])
      .filter((c) => c && c.expiry)
      .map((c) => ({ name: c.name, days: Math.floor((new Date(c.expiry).getTime() - nowMs) / DAY_MS) }))
      .filter((c) => !Number.isNaN(c.days) && c.days <= withinDays)
      .sort((a, b) => a.days - b.days);
    if (expiring.length === 0) return;
    const soonest = expiring[0];
    const more = expiring.length > 1 ? ` (+${expiring.length - 1} more)` : '';
    const when =
      soonest.days < 0 ? `expired ${Math.abs(soonest.days)}d ago`
      : soonest.days === 0 ? 'expires today'
      : `expires in ${soonest.days}d`;
    out.push({
      id: `cert-${w.id ?? w.name}`,
      severity: soonest.days < 0 ? 'critical' : 'warning',
      title: `${w.name ?? 'Worker'} — certificate ${soonest.days < 0 ? 'expired' : 'expiring'}`,
      detail: `${soonest.name ?? 'Certificate'} ${when}${more}`,
      to: '/workers',
    });
  });
  return out;
}

/**
 * Service jobs marked 'completed' (awaiting manager vetting) that have been
 * sitting longer than staleDays, based on signedAt (falling back to createdAt).
 * Older than staleDays → warning; a week or more → critical.
 * @returns {Array<{id,severity,title,detail,to}>}
 */
export function vetQueueAlerts(jobs = [], { staleDays = 2, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const out = [];
  jobs.forEach((j) => {
    if (j.status !== 'completed') return;
    const ts = toDate(j.signedAt) ?? toDate(j.createdAt);
    if (!ts) return;
    const age = Math.floor((nowMs - ts.getTime()) / DAY_MS);
    if (age < staleDays) return;
    out.push({
      id: `vet-${j.id}`,
      severity: age >= 7 ? 'critical' : 'warning',
      title: `${j.customerName ?? 'Job'} — awaiting vet`,
      detail: `Completed ${age}d ago, still needs manager sign-off`,
      to: '/jobs',
    });
  });
  return out;
}

/**
 * Approved leave whose [dateFrom, dateTo] range covers a service job's
 * scheduledDate for which the same user is in assignedTo — i.e. someone is
 * booked for a job on a day they're approved to be away. Always critical.
 * Dates are 'YYYY-MM-DD' strings, safe to compare lexicographically.
 * @returns {Array<{id,severity,title,detail,to}>}
 */
export function leaveClashAlerts(leaveApplications = [], jobs = []) {
  const out = [];
  leaveApplications
    .filter((l) => l.status === 'approved' && l.dateFrom && l.dateTo)
    .forEach((l) => {
      jobs.forEach((j) => {
        if (!j.scheduledDate) return;
        if (!Array.isArray(j.assignedTo) || !j.assignedTo.includes(l.userId)) return;
        if (j.scheduledDate < l.dateFrom || j.scheduledDate > l.dateTo) return;
        const range = l.dateTo !== l.dateFrom ? `${l.dateFrom}–${l.dateTo}` : l.dateFrom;
        out.push({
          id: `clash-${l.id ?? l.userId}-${j.id}`,
          severity: 'critical',
          title: `${l.name ?? 'Someone'} scheduled while on leave`,
          detail: `${l.type ?? 'Leave'} ${range} clashes with a job on ${j.scheduledDate}`,
          to: '/jobs',
        });
      });
    });
  return out;
}

/**
 * Unpaid claims (status !== 'paid') created more than agingDays ago, rolled up
 * into a single warning with the total outstanding amount in the detail.
 * @returns {Array<{id,severity,title,detail,to}>}
 */
export function claimsAgingAlerts(claims = [], { agingDays = 30, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const aging = claims.filter((c) => {
    if (c.status === 'paid') return false;
    const ts = toDate(c.createdAt);
    return ts ? Math.floor((nowMs - ts.getTime()) / DAY_MS) >= agingDays : false;
  });
  if (aging.length === 0) return [];
  const outstanding = aging.reduce((s, c) => s + (c.netAmount ?? 0), 0);
  return [{
    id: 'claims-aging',
    severity: 'warning',
    title: `${aging.length} claim${aging.length > 1 ? 's' : ''} unpaid over ${agingDays} days`,
    detail: `${fmtMoney(outstanding)} outstanding — follow up on payment`,
    to: '/finance',
  }];
}

/**
 * Info reminder shown from the 7th to the 14th of the month, since CPF
 * contributions are due by the 14th. Purely date-driven, no data source.
 * @returns {Array<{id,severity,title,detail,to}>}
 */
export function cpfDeadlineAlert(now = new Date()) {
  const day = Number(
    new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric' }).format(now)
  );
  if (day < 7 || day > 14) return [];
  return [{
    id: 'cpf-deadline',
    severity: 'info',
    title: 'CPF contributions due by the 14th',
    detail: "Submit and pay this month's CPF before the 14th to avoid late interest.",
    to: '/salary',
  }];
}

/**
 * Runs every detector over the supplied data and returns one array sorted
 * critical → warning → info. Pass only data the viewer is permitted to see;
 * empty/omitted sources simply contribute no alerts. `includeCpf` lets the
 * caller suppress the (management-facing) CPF reminder for viewers who can't
 * reach the /salary screen.
 * @returns {Array<{id,severity,title,detail,to}>}
 */
export function buildAttentionFeed({
  workers = [], jobs = [], leaveApplications = [], claims = [],
  now = new Date(), includeCpf = true,
} = {}) {
  const items = [
    ...certExpiryAlerts(workers, { now }),
    ...vetQueueAlerts(jobs, { now }),
    ...leaveClashAlerts(leaveApplications, jobs),
    ...claimsAgingAlerts(claims, { now }),
    ...(includeCpf ? cpfDeadlineAlert(now) : []),
  ];
  const weight = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => weight[a.severity] - weight[b.severity]);
}
