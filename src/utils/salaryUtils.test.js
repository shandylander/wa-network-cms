import { calcPayslip } from './salaryUtils';

// Verifies calcPayslip wires the CPF engine correctly end-to-end. Detailed CPF
// math is covered by cpfRates.test.js; here we confirm the payslip picks up the
// right contribution from config.dob/residency and that the master switch works.
const citizen30 = {
  basicPay: 4000,
  standardDailyHours: 8,
  otMultiplier: 1.5,
  cpfApplicable: true,
  residency: 'citizen',
  dob: '1996-01-01', // age 30 in 2026
  allowances: [],
  otherDeductions: [],
};

describe('calcPayslip CPF integration', () => {
  test('citizen aged 30, $4000 basic, no NPL/OT → CPF 800/680, net 3200', () => {
    const r = calcPayslip({ config: citizen30, attendanceRecords: [], nplDays: 0, month: '2026-07' });
    expect(r.grossPay).toBe(4000);
    expect(r.cpfEmployee).toBe(800);   // floor(4000 * 0.20)
    expect(r.cpfEmployer).toBe(680);   // 1480 total − 800
    expect(r.cpfWage).toBe(4000);
    expect(r.netPay).toBe(3200);       // gross − employee CPF − other deductions
  });

  test('cpfApplicable:false zeroes CPF but SDL still applies', () => {
    const r = calcPayslip({
      config: { ...citizen30, cpfApplicable: false },
      attendanceRecords: [], nplDays: 0, month: '2026-07',
    });
    expect(r.cpfEmployee).toBe(0);
    expect(r.cpfEmployer).toBe(0);
    expect(r.netPay).toBe(4000);       // nothing deducted
    expect(r.sdl).toBeCloseTo(10);     // 0.25% × $4000 (below the $4500 cap), employer cost
  });

  test('an above-ceiling earner has CPF wage capped at $8000', () => {
    const r = calcPayslip({
      config: { ...citizen30, basicPay: 12000 },
      attendanceRecords: [], nplDays: 0, month: '2026-07',
    });
    expect(r.cpfWage).toBe(8000);
    expect(r.cpfEmployee).toBe(1600);  // floor(8000 * 0.20)
    expect(r.cpfEmployer).toBe(1360);  // 2960 total − 1600
  });

  test('employerCost = gross + employer CPF + SDL', () => {
    const r = calcPayslip({ config: citizen30, attendanceRecords: [], nplDays: 0, month: '2026-07' });
    expect(r.employerCost).toBeCloseTo(r.grossPay + r.cpfEmployer + r.sdl);
  });
});
