/* ── Working days calc (Mon–Sat, Singapore construction standard) ── */
export const getWorkingDaysInMonth = (year, month) => {
  const days = new Date(year, month, 0).getDate(); // days in month
  let count = 0;
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) count++; // exclude Sunday
  }
  return count;
};

/* ── Monthly date range strings ─────────────────────────────────── */
export const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2,'0')}` };
};

/* ── Core payslip calculation ───────────────────────────────────── */
export const calcPayslip = ({ config, attendanceRecords, nplDays, month }) => {
  const [y, m] = month.split('-').map(Number);
  const workingDays      = getWorkingDaysInMonth(y, m);
  const stdHours         = config.standardDailyHours ?? 8;
  const daysPresent      = attendanceRecords.filter(r => r.status === 'complete').length;

  let otHours = 0;
  attendanceRecords.forEach(r => {
    if (r.hoursWorked > stdHours) otHours += r.hoursWorked - stdHours;
  });
  otHours = Math.round(otHours * 10) / 10;

  const basicPay         = config.basicPay ?? 0;
  const dailyRate        = workingDays > 0 ? basicPay / workingDays : 0;
  const hourlyRate       = stdHours > 0 ? dailyRate / stdHours : 0;
  const nplDeduction     = Math.round(nplDays * dailyRate * 100) / 100;
  const otPay            = Math.round(otHours * hourlyRate * (config.otMultiplier ?? 1.5) * 100) / 100;
  const allowanceTotal   = (config.allowances ?? []).reduce((s, a) => s + (a.amount ?? 0), 0);
  const grossPay         = Math.round((basicPay - nplDeduction + otPay + allowanceTotal) * 100) / 100;

  const cpfWages     = Math.min(grossPay, 8000); // OW ceiling $8,000 from Jan 2026
  const cpfEmployee  = config.cpfApplicable ? Math.round(cpfWages * 0.20) : 0;
  const cpfEmployer  = config.cpfApplicable ? Math.round(cpfWages * 0.17) : 0;
  const otherDedTotal = (config.otherDeductions ?? []).reduce((s, d) => s + (d.amount ?? 0), 0);
  const netPay       = Math.round((grossPay - cpfEmployee - otherDedTotal) * 100) / 100;

  return {
    workingDays, daysPresent, nplDays, otHours,
    basicPay, dailyRate: Math.round(dailyRate * 100) / 100,
    nplDeduction, otPay, allowanceTotal,
    allowances:      config.allowances ?? [],
    grossPay, cpfEmployee, cpfEmployer,
    otherDeductions: config.otherDeductions ?? [],
    otherDedTotal, netPay,
  };
};

const LOGO_B64 = 'data:image/png;base64,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';

/* ── Print payslip ──────────────────────────────────────────────── */
export const printPayslip = (payslip, staffName, month) => {
  const monthLabel = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T00:00:00+08:00`));
  const fmtAmt = (n) => `$${Number(n ?? 0).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Payslip – ${staffName} – ${monthLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a2e; padding: 32px; max-width: 640px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #CC0000; padding-bottom: 12px; margin-bottom: 20px; }
    .logo-wrap { background: #1a1a2e; border-radius: 8px; padding: 6px 10px; display: inline-flex; align-items: center; }
    .logo-img { height: 28px; width: auto; display: block; }
    .payslip-title { font-size: 13px; font-weight: 600; color: #5a6577; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 20px; background: #f5f6f8; padding: 12px 14px; border-radius: 6px; }
    .info-row { display: flex; flex-direction: column; }
    .info-lbl { font-size: 10px; font-weight: 600; color: #5a6577; text-transform: uppercase; letter-spacing: .05em; }
    .info-val { font-size: 13px; font-weight: 600; color: #1a2233; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #1a1a2e; color: #fff; font-size: 11px; font-weight: 600; padding: 7px 10px; text-align: left; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e6ed; font-size: 12px; }
    td:last-child { text-align: right; font-weight: 600; }
    .subtotal td { font-weight: 700; background: #f5f6f8; }
    .net-row { background: #1a1a2e; }
    .net-row td { color: #fff; font-size: 14px; font-weight: 700; padding: 10px; }
    .footer { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .sig-box { border-top: 1px solid #1a1a2e; padding-top: 6px; font-size: 11px; color: #5a6577; }
    .note { font-size: 10px; color: #5a6577; margin-top: 20px; text-align: center; }
  </style></head><body>
  <div class="header">
    <div>
      <div class="logo-wrap"><img src="${LOGO_B64}" class="logo-img" alt="WA! Network Asia" /></div>
      <div style="font-size:11px;color:#5a6577;margin-top:6px;">CCTV Installation Contractor</div>
    </div>
    <div style="text-align:right"><div class="payslip-title">PAYSLIP</div><div style="font-size:11px;color:#5a6577;margin-top:2px;">${monthLabel}</div></div>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="info-lbl">Employee</span><span class="info-val">${staffName}</span></div>
    <div class="info-row"><span class="info-lbl">Pay Period</span><span class="info-val">${monthLabel}</span></div>
    <div class="info-row"><span class="info-lbl">Working Days</span><span class="info-val">${payslip.workingDays} days</span></div>
    <div class="info-row"><span class="info-lbl">Days Present</span><span class="info-val">${payslip.daysPresent} days</span></div>
    ${payslip.nplDays > 0 ? `<div class="info-row"><span class="info-lbl">NPL Days</span><span class="info-val" style="color:#d97b00">${payslip.nplDays} days</span></div>` : ''}
    ${payslip.otHours > 0 ? `<div class="info-row"><span class="info-lbl">OT Hours</span><span class="info-val">${payslip.otHours}h</span></div>` : ''}
  </div>

  <table>
    <tr><th colspan="2">EARNINGS</th></tr>
    <tr><td>Basic Pay</td><td>${fmtAmt(payslip.basicPay)}</td></tr>
    ${payslip.otPay > 0 ? `<tr><td>Overtime Pay (${payslip.otHours}h)</td><td>${fmtAmt(payslip.otPay)}</td></tr>` : ''}
    ${(payslip.allowances ?? []).map(a => `<tr><td>${a.name}</td><td>${fmtAmt(a.amount)}</td></tr>`).join('')}
    <tr class="subtotal"><td>Gross Pay</td><td>${fmtAmt(payslip.grossPay)}</td></tr>
  </table>

  <table>
    <tr><th colspan="2">DEDUCTIONS</th></tr>
    ${payslip.nplDeduction > 0 ? `<tr><td>No-Pay Leave (${payslip.nplDays}d × ${fmtAmt(payslip.dailyRate)})</td><td>– ${fmtAmt(payslip.nplDeduction)}</td></tr>` : ''}
    ${payslip.cpfEmployee > 0 ? `<tr><td>Employee CPF (20%)</td><td>– ${fmtAmt(payslip.cpfEmployee)}</td></tr>` : ''}
    ${(payslip.otherDeductions ?? []).map(d => `<tr><td>${d.name}</td><td>– ${fmtAmt(d.amount)}</td></tr>`).join('')}
    ${(!payslip.nplDeduction && !payslip.cpfEmployee && !payslip.otherDeductions?.length) ? '<tr><td colspan="2" style="color:#5a6577">No deductions</td></tr>' : ''}
    <tr class="net-row"><td>NET PAY</td><td>${fmtAmt(payslip.netPay)}</td></tr>
  </table>

  ${payslip.cpfEmployer > 0 ? `<p style="font-size:11px;color:#5a6577;margin-bottom:16px;">Employer CPF contribution (17%): ${fmtAmt(payslip.cpfEmployer)} — not deducted from employee</p>` : ''}

  <div class="footer">
    <div class="sig-box">Employee Signature</div>
    <div class="sig-box">Authorised by</div>
  </div>
  <p class="note">This payslip is computer generated and does not require a physical signature unless signed above.</p>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return false; // popup blocked
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
  return true;
};

export const fmtSGD = (n) =>
  `$${Number(n ?? 0).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`;
