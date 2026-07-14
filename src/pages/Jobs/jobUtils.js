import { Timestamp } from 'firebase/firestore';
import { getLocation, reverseGeocode } from '../../utils/attendanceUtils';

// Roles that can be rostered onto a service job — i.e. everyone in the WA
// company, not subcontractors. These all hold `manage:service-reports` by
// default, which the serviceJobs rules require to read + drive a job (check
// in/out, complete), so a job assigned to any of them is actually workable.
// Subcon roles are deliberately excluded: without that permission they can't
// check in, so assigning them would create a dead job.
export const ASSIGNABLE_ROLES = ['owner', 'manager', 'supervisor', 'staff'];

// Staff (front-line technicians) sort first; others follow so the scheduler
// sees the usual technicians up top, with supervisors/managers/owner after.
const ROLE_RANK = { staff: 0, supervisor: 1, manager: 2, owner: 3 };

// Short role tag shown beside non-staff assignees so the scheduler can see at
// a glance they're rostering a supervisor/manager/owner, not a technician.
export const ROLE_TAG = { owner: 'Owner', manager: 'Manager', supervisor: 'Supervisor' };

// Fetch → the active company people who can be assigned to jobs, staff-first
// then by name. Filters roles client-side (small user base) so no composite
// index is needed. Pass the docs from a `users` where(status==active) query.
export const toAssignable = (docs) =>
  docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => ASSIGNABLE_ROLES.includes(u.role))
    .sort((a, b) =>
      (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9)
      || (a.name ?? '').localeCompare(b.name ?? ''));

// GPS + timestamp for check-in/out — degrades gracefully to a bare
// timestamp if location access fails/is denied, same as WorkerClock.jsx's
// handling of a failed getLocation() call.
export async function stamp() {
  const time = Timestamp.now();
  try {
    const loc = await getLocation();
    const address = await reverseGeocode(loc.lat, loc.lng).catch(() => '');
    return { time, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, address };
  } catch {
    return { time, lat: null, lng: null, accuracy: null, address: null };
  }
}
