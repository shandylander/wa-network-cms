// ============================================================================
// Singapore CPF & SDL rate module — YEAR 2026
// ----------------------------------------------------------------------------
// RATES VERIFIED against the official CPF Board contribution-rate table
// effective 1 Jan 2026 (cpf.gov.sg) on 2026-07-14, including the senior-worker
// increases to the 55–60 and 60–65 bands. Citizen/full and SPR year-1/year-2
// graduated cells checked cell by cell.
//
// Design goal: a yearly rate change is a SINGLE edit to CPF_RATES_2026 (plus
// the two ceiling constants). Nothing else in this file hardcodes a rate.
//
// Each cell = { employeePct, employerPct } as decimal fractions of CPF wage.
//   total contribution % = employeePct + employerPct
//
// Age bands (CPF convention — boundary is the UPPER edge, inclusive):
//   '55 and below', 'above 55 to 60', 'above 60 to 65',
//   'above 65 to 70', 'above 70'
//
// Residency:
//   citizen  → Singapore Citizen (also SPR 3rd year onwards = "full")
//   spr.year1 / spr.year2 → SPR graduated (Graduated/Graduated) rates
//   spr.full → SPR 3rd year onwards == citizen rates (aliased, single source)
// ============================================================================

// ── Ceilings (2026) ────────────────────────────────────────────────────────
// Ordinary Wage (OW) ceiling reached its final planned step of $8,000/month on
// 1 Jan 2026 (up from $7,400 in 2025). VERIFIED: cpf.gov.sg.
export const OW_CEILING_2026 = 8000;

// Annual CPF salary ceiling (OW + AW) for 2026.  SOURCE: CPF — VERIFY.
// Additional Wage (AW) ceiling formula (annual):
//   AW ceiling = 102,000 − (total OW subject to CPF for the calendar year)
// NOTE / SIMPLIFICATION: this monthly payslip engine applies only the OW
// ceiling. It does NOT track year-to-date OW to compute a per-employee AW
// ceiling, because a single monthly payslip has no YTD context here. Bonuses /
// additional wages are therefore currently treated as ordinary monthly wage
// under the OW ceiling. TODO(3b): compute AW ceiling from YTD OW when an
// annual payroll ledger exists.
export const ANNUAL_CPF_CEILING_2026 = 102000;

// ── Age-band × residency contribution table ────────────────────────────────
// VERIFIED against CPF Board's "CPF Contribution Rate Table from 1 January
// 2026" (cpf.gov.sg). Citizen == SPR-full by design. Percentages are decimal
// fractions of CPF wage.
export const CPF_RATES_2026 = {
  // Singapore Citizen / SPR (3rd year onwards)
  citizen: {
    // 55 & below: EE 20% / ER 17% (total 37%).
    '55 and below':  { employeePct: 0.20,  employerPct: 0.17  },
    // above 55–60: EE 18% / ER 16% (total 34%) — raised 1 Jan 2026.
    'above 55 to 60': { employeePct: 0.18,  employerPct: 0.16  },
    // above 60–65: EE 12.5% / ER 12.5% (total 25%) — raised 1 Jan 2026.
    'above 60 to 65': { employeePct: 0.125, employerPct: 0.125 },
    // above 65–70: EE 7.5% / ER 9% (total 16.5%).
    'above 65 to 70': { employeePct: 0.075, employerPct: 0.09  },
    // above 70: EE 5% / ER 7.5% (total 12.5%).
    'above 70':       { employeePct: 0.05,  employerPct: 0.075 },
  },
  spr: {
    // SPR 1st year (Graduated/Graduated), 2026 table.
    year1: {
      '55 and below':  { employeePct: 0.05, employerPct: 0.04  },
      'above 55 to 60': { employeePct: 0.05, employerPct: 0.04  },
      'above 60 to 65': { employeePct: 0.05, employerPct: 0.035 },
      'above 65 to 70': { employeePct: 0.05, employerPct: 0.035 },
      'above 70':       { employeePct: 0.05, employerPct: 0.035 },
    },
    // SPR 2nd year (Graduated/Graduated), 2026 table.
    year2: {
      '55 and below':  { employeePct: 0.15,  employerPct: 0.09  },
      'above 55 to 60': { employeePct: 0.125, employerPct: 0.06  },
      'above 60 to 65': { employeePct: 0.075, employerPct: 0.035 },
      'above 65 to 70': { employeePct: 0.05,  employerPct: 0.035 },
      'above 70':       { employeePct: 0.05,  employerPct: 0.035 },
    },
    // SPR 3rd year onwards == citizen rates. Single source of truth: reuse below.
    // (Populated at module init — see `CPF_RATES_2026.spr.full` assignment.)
    full: null,
  },
};
// SPR "full" (3rd year+) rates are identical to citizen rates — alias, don't duplicate.
CPF_RATES_2026.spr.full = CPF_RATES_2026.citizen;

// Ordered bands, low age → high age (used for relationship assertions/tests).
export const AGE_BANDS = [
  '55 and below',
  'above 55 to 60',
  'above 60 to 65',
  'above 65 to 70',
  'above 70',
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const round2 = (n) => Math.round(n * 100) / 100;

// Parse a date-ish value (Date | 'YYYY-MM-DD' | ISO | ms) to a Date, or null.
const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (v && typeof v.toDate === 'function') return v.toDate(); // Firestore Timestamp
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

/**
 * Whole-years age at a given month.
 * @param {Date|string} dob   date of birth
 * @param {Date|string} asOf  the payslip month (defaults to today)
 * @returns {number} age in whole years, or NaN if dob missing/invalid
 */
export const ageAt = (dob, asOf = new Date()) => {
  const b = toDate(dob);
  const a = toDate(asOf) ?? new Date();
  if (!b) return NaN;
  let age = a.getFullYear() - b.getFullYear();
  const m = a.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < b.getDate())) age--;
  return age;
};

/**
 * Derive the CPF age band from date of birth at a given month.
 * SIMPLIFICATION: uses whole-years age at `asOf`. CPF technically shifts a
 * worker into the higher band from the first day of the month AFTER the
 * milestone birthday (55/60/65/70). That off-by-one-month nuance is not
 * modelled here. TODO: apply month-after-birthday rule if payroll precision
 * around birthday months is required.
 * @returns {string} one of AGE_BANDS; defaults to '55 and below' if dob unknown.
 */
export const ageBand = (dob, asOf = new Date()) => {
  const age = ageAt(dob, asOf);
  if (isNaN(age)) return '55 and below'; // safest default (highest EE rate)
  if (age <= 55) return '55 and below';
  if (age <= 60) return 'above 55 to 60';
  if (age <= 65) return 'above 60 to 65';
  if (age <= 70) return 'above 65 to 70';
  return 'above 70';
};

/**
 * For an SPR, which graduated tier applies at `asOf`: 'year1' | 'year2' | 'full'.
 * Based on whole months elapsed since prStartDate: <12mo → year1, <24mo → year2,
 * else full (3rd year onwards). If prStartDate is missing, default to 'full'
 * (full rates — the conservative, most-common case for established PRs).
 */
export const sprTier = (prStartDate, asOf = new Date()) => {
  const start = toDate(prStartDate);
  const a = toDate(asOf) ?? new Date();
  if (!start) return 'full';
  const months = (a.getFullYear() - start.getFullYear()) * 12 + (a.getMonth() - start.getMonth());
  if (months < 12) return 'year1';
  if (months < 24) return 'year2';
  return 'full';
};

/**
 * Look up the { employeePct, employerPct } cell for a worker.
 * @param {'citizen'|'spr'} residency
 * @param {string} band  one of AGE_BANDS
 * @param {'year1'|'year2'|'full'} tier  SPR tier (ignored for citizens)
 */
export const rateCell = (residency, band, tier = 'full') => {
  const table = residency === 'spr' ? CPF_RATES_2026.spr[tier] : CPF_RATES_2026.citizen;
  return (table && table[band]) || CPF_RATES_2026.citizen['55 and below'];
};

/**
 * Compute the CPF contribution for one month.
 *
 * @param {Object}  args
 * @param {Date|string} args.dob          date of birth
 * @param {'citizen'|'spr'} args.residency
 * @param {Date|string} [args.prStartDate] required only when residency==='spr'
 * @param {number}  args.grossWage        total wage for the month (SGD)
 * @param {Date|string} [args.asOf]       payslip month (defaults to today)
 * @returns {{ employee:number, employer:number, cpfWage:number, total:number,
 *            band:string, tier:string, employeePct:number, employerPct:number }}
 *
 * Rounding — CPF Board rule (VERIFY at cpf.gov.sg):
 *   1. Total contribution is rounded to the NEAREST dollar (0.5 rounds up).
 *   2. Employee's share is rounded DOWN to the nearest dollar (cents dropped).
 *   3. Employer's share = total − employee's share.
 * Applying the OW ceiling of $8,000/month before computing.
 */
export const cpfContribution = ({ dob, residency = 'citizen', prStartDate, grossWage = 0, asOf = new Date() }) => {
  const band = ageBand(dob, asOf);
  const tier = residency === 'spr' ? sprTier(prStartDate, asOf) : 'full';
  const cell = rateCell(residency, band, tier);

  // Apply Ordinary Wage ceiling. (No AW handling — see ANNUAL_CPF_CEILING_2026 note.)
  const cpfWage = Math.max(0, Math.min(Number(grossWage) || 0, OW_CEILING_2026));

  // SIMPLIFICATION: low-wage graduated bands (total wages ≤ $750/month, where
  // the employee share phases in) are NOT modelled — full rates are applied to
  // the capped wage. TODO: model the $50–$750 phase-in if low earners exist.
  if (cpfWage <= 0) {
    return { employee: 0, employer: 0, cpfWage: 0, total: 0, band, tier, employeePct: cell.employeePct, employerPct: cell.employerPct };
  }

  const totalPct = cell.employeePct + cell.employerPct;
  const total = Math.round(cpfWage * totalPct);           // nearest dollar
  const employee = Math.floor(cpfWage * cell.employeePct); // round DOWN (drop cents)
  const employer = total - employee;                       // remainder

  return { employee, employer, cpfWage, total, band, tier, employeePct: cell.employeePct, employerPct: cell.employerPct };
};

// ── SDL (Skills Development Levy) ────────────────────────────────────────────
// 0.25% of an employee's total monthly wage, subject to:
//   minimum $2   (wages up to $800)
//   maximum $11.25 (wages of $4,500 and above)
// SOURCE: SkillsFuture Singapore / CPF SDL — VERIFY (rate & bounds stable, but confirm).
export const SDL_RATE = 0.0025;
export const SDL_MIN = 2;
export const SDL_MAX = 11.25;
export const SDL_WAGE_CAP = 4500; // wage above which SDL is capped at SDL_MAX

/**
 * Skills Development Levy for one month.
 * @param {number} grossWage total monthly wage (SGD)
 * @returns {number} SDL payable (employer cost), 2dp; 0 if no wage.
 */
export const sdl = (grossWage) => {
  const w = Number(grossWage) || 0;
  if (w <= 0) return 0;
  const raw = round2(Math.min(w, SDL_WAGE_CAP) * SDL_RATE);
  return Math.min(SDL_MAX, Math.max(SDL_MIN, raw));
};
