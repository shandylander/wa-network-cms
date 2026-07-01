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

  const cpfWages     = Math.min(grossPay, 6000);
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
    .company { font-size: 18px; font-weight: 700; color: #CC0000; }
    .company span { color: #1a1a2e; }
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
    <div><div class="company">WA! <span>NETWORK ASIA</span></div><div style="font-size:11px;color:#5a6577;margin-top:2px;">CCTV Installation Contractor</div></div>
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
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
};

export const fmtSGD = (n) =>
  `$${Number(n ?? 0).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`;
