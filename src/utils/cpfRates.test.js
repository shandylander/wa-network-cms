import {
  CPF_RATES_2026,
  OW_CEILING_2026,
  AGE_BANDS,
  ageAt,
  ageBand,
  sprTier,
  rateCell,
  cpfContribution,
  sdl,
  SDL_MIN,
  SDL_MAX,
} from './cpfRates';

// NOTE: These tests assert STRUCTURE, math relationships and ceiling behaviour.
// They deliberately AVOID hardcoding the (to-be-verified) 2026 percentages, so
// that correcting a rate during orchestrator review does not break the suite.
// A `dob` giving age N "as of" a fixed asOf date is used throughout.

const asOf = new Date('2026-07-01T00:00:00+08:00');
const dobForAge = (age) => new Date(Date.UTC(2026 - age, 0, 1)); // born 1 Jan, aged `age` by Jul 2026

// Exact-value lock on the VERIFIED 2026 rates (checked against cpf.gov.sg on
// 2026-07-14). Unlike the relationship tests below, these WILL break if a rate
// cell is changed — which is the point: they guard the specific figures.
describe('verified 2026 exact contributions', () => {
  const cases = [
    // [age, gross, expectedEmployee, expectedEmployer, expectedTotal]
    [30, 4000, 800, 680, 1480],   // 55 & below: EE20/ER17 → 34.. total 1480
    [30, 12000, 1600, 1360, 2960], // ceiling: cpfWage 8000, EE20/ER17
    [58, 4000, 720, 640, 1360],   // above 55–60: EE18/ER16 (2026 senior step)
    [62, 5000, 625, 625, 1250],   // above 60–65: EE12.5/ER12.5 (2026 senior step)
    [68, 6000, 450, 540, 990],    // above 65–70: EE7.5/ER9
    [75, 6000, 300, 450, 750],    // above 70: EE5/ER7.5
  ];
  it.each(cases)('citizen age %i @ $%i → EE %i / ER %i / total %i', (age, gross, ee, er, total) => {
    const r = cpfContribution({ dob: dobForAge(age), residency: 'citizen', grossWage: gross, asOf });
    expect(r.employee).toBe(ee);
    expect(r.employer).toBe(er);
    expect(r.total).toBe(total);
  });
});

describe('age helpers', () => {
  it('computes whole-years age at a month', () => {
    expect(ageAt(new Date('1990-01-01'), asOf)).toBe(36);
  });

  it('maps ages to the correct CPF band (upper-edge inclusive)', () => {
    expect(ageBand(dobForAge(30), asOf)).toBe('55 and below');
    expect(ageBand(dobForAge(55), asOf)).toBe('55 and below');
    expect(ageBand(dobForAge(58), asOf)).toBe('above 55 to 60');
    expect(ageBand(dobForAge(60), asOf)).toBe('above 55 to 60');
    expect(ageBand(dobForAge(63), asOf)).toBe('above 60 to 65');
    expect(ageBand(dobForAge(68), asOf)).toBe('above 65 to 70');
    expect(ageBand(dobForAge(75), asOf)).toBe('above 70');
  });

  it('defaults to "55 and below" when dob is missing', () => {
    expect(ageBand(undefined, asOf)).toBe('55 and below');
  });
});

describe('rate table structure', () => {
  it('has every age band for citizen and all SPR tiers', () => {
    ['citizen'].forEach((res) => {
      AGE_BANDS.forEach((b) => {
        expect(CPF_RATES_2026[res][b]).toBeDefined();
      });
    });
    ['year1', 'year2', 'full'].forEach((tier) => {
      AGE_BANDS.forEach((b) => {
        const cell = CPF_RATES_2026.spr[tier][b];
        expect(cell).toBeDefined();
        expect(typeof cell.employeePct).toBe('number');
        expect(typeof cell.employerPct).toBe('number');
      });
    });
  });

  it('aliases SPR full (year 3+) to citizen rates', () => {
    expect(CPF_RATES_2026.spr.full).toBe(CPF_RATES_2026.citizen);
  });

  it('employee CPF share decreases with age (below-55 >= above-70)', () => {
    const below55 = rateCell('citizen', '55 and below').employeePct;
    const above70 = rateCell('citizen', 'above 70').employeePct;
    expect(above70).toBeLessThan(below55);
  });
});

describe('sprTier', () => {
  it('returns year1/year2/full by months since PR grant', () => {
    expect(sprTier('2026-01-01', asOf)).toBe('year1'); // 6 months in
    expect(sprTier('2025-01-01', asOf)).toBe('year2'); // 18 months in
    expect(sprTier('2022-01-01', asOf)).toBe('full');  // >24 months
  });
  it('defaults to full when prStartDate missing', () => {
    expect(sprTier(undefined, asOf)).toBe('full');
  });
});

describe('cpfContribution — 30 y/o citizen', () => {
  const r = cpfContribution({ dob: dobForAge(30), residency: 'citizen', grossWage: 4000, asOf });

  it('uses the "55 and below" band', () => {
    expect(r.band).toBe('55 and below');
  });
  it('cpfWage equals gross when under the OW ceiling', () => {
    expect(r.cpfWage).toBe(4000);
  });
  it('employer + employee equals rounded total', () => {
    expect(r.employee + r.employer).toBe(r.total);
  });
  it('employee share is a whole dollar (rounded down)', () => {
    expect(Number.isInteger(r.employee)).toBe(true);
    expect(r.employee).toBeLessThanOrEqual(4000 * r.employeePct);
  });
});

describe('cpfContribution — 58 y/o citizen', () => {
  const young = cpfContribution({ dob: dobForAge(30), residency: 'citizen', grossWage: 4000, asOf });
  const older = cpfContribution({ dob: dobForAge(58), residency: 'citizen', grossWage: 4000, asOf });

  it('uses the "above 55 to 60" band', () => {
    expect(older.band).toBe('above 55 to 60');
  });
  it('total contribution not more than a below-55 worker on same wage', () => {
    expect(older.total).toBeLessThanOrEqual(young.total);
  });
});

describe('cpfContribution — SPR in PR year 2', () => {
  const r = cpfContribution({ dob: dobForAge(30), residency: 'spr', prStartDate: '2025-01-01', grossWage: 4000, asOf });

  it('resolves to the year2 tier', () => {
    expect(r.tier).toBe('year2');
  });
  it('employer + employee equals total, all non-negative', () => {
    expect(r.employee + r.employer).toBe(r.total);
    expect(r.employee).toBeGreaterThanOrEqual(0);
    expect(r.employer).toBeGreaterThanOrEqual(0);
  });
  it('year-2 employee CPF is less than an equivalent full-rate PR', () => {
    const full = cpfContribution({ dob: dobForAge(30), residency: 'spr', prStartDate: '2020-01-01', grossWage: 4000, asOf });
    expect(r.employee).toBeLessThan(full.employee);
  });
});

describe('cpfContribution — OW ceiling', () => {
  it('caps CPF wage at the $8,000 OW ceiling for high earners', () => {
    const r = cpfContribution({ dob: dobForAge(30), residency: 'citizen', grossWage: 12000, asOf });
    expect(r.cpfWage).toBe(OW_CEILING_2026);
    expect(r.cpfWage).toBe(Math.min(12000, OW_CEILING_2026));
  });

  it('a $9,000 earner contributes the same as an $8,000 earner (both at ceiling)', () => {
    const a = cpfContribution({ dob: dobForAge(30), residency: 'citizen', grossWage: 9000, asOf });
    const b = cpfContribution({ dob: dobForAge(30), residency: 'citizen', grossWage: 8000, asOf });
    expect(a.employee).toBe(b.employee);
    expect(a.employer).toBe(b.employer);
  });

  it('returns zeros for zero wage', () => {
    const r = cpfContribution({ dob: dobForAge(30), residency: 'citizen', grossWage: 0, asOf });
    expect(r).toMatchObject({ employee: 0, employer: 0, cpfWage: 0, total: 0 });
  });
});

describe('sdl', () => {
  it('is the $2 minimum for low wages', () => {
    expect(sdl(500)).toBe(SDL_MIN);
  });
  it('is 0.25% in the mid range', () => {
    expect(sdl(2000)).toBeCloseTo(5, 2);
  });
  it('caps at $11.25 for high wages', () => {
    expect(sdl(5000)).toBe(SDL_MAX);
    expect(sdl(50000)).toBe(SDL_MAX);
  });
  it('is 0 when there is no wage', () => {
    expect(sdl(0)).toBe(0);
  });
});
