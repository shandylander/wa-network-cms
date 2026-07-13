// Default leave entitlements, used when no leaveEntitlements document has
// been saved for a user yet. Admin (LeaveSettings) and worker/staff views
// (MyLeave, WorkerLeave) must share these so displayed balances always tally.
export const DEFAULT_AL = 7;
export const DEFAULT_MC = 14;
// Childcare Leave — generic company default (MOM guideline: 6 days/yr for
// eligible parents). Configurable per staff member in LeaveSettings.
export const DEFAULT_CCL = 6;
// Hospitalisation Leave — generic company default (MOM guideline: up to 60
// days/yr, inclusive of outpatient MC). Configurable per staff member.
export const DEFAULT_HL = 60;

// Default carry-forward window for unused Annual Leave: no days carried in
// by default, lapsing at the end of March the following year if the admin
// does set a carried amount. Only AL carries forward under company policy —
// MC/CCL/HL reset to the full entitlement each year and are never carried.
export const DEFAULT_CARRY_FORWARD_EXPIRY_MONTH = 3; // March
