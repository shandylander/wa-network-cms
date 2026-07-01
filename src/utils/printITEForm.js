import { ITE_FORMS } from './materialData';

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function printITEOrderForm(order) {
  const formConfig = ITE_FORMS[order.formType];
  if (!formConfig) return;

  const qty = order.quantities ?? {};

  const tablesHtml = formConfig.sections.map(section => {
    const rows = section.items.map(item => {
      const q = qty[item.id] ? Number(qty[item.id]) : '';
      return `<tr>
        <td class="sno">${item.sno}</td>
        <td class="desc">${item.desc}</td>
        <td class="qty">${q}</td>
      </tr>`;
    }).join('');
    return `
      <table class="order-table">
        <thead>
          <tr>
            <th class="sno">S/No</th>
            <th class="desc">${section.header}</th>
            <th class="qty">Qty</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ITE Order Form — ${order.ref ?? ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #000; padding: 15mm 15mm 10mm; }

    /* ── Header ── */
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .ite-logo-box { border: 2px solid #e67e00; padding: 6px 10px; display: inline-block; }
    .ite-logo-top { color: #e67e00; font-size: 15pt; font-weight: 900; letter-spacing: 1px; }
    .ite-logo-sub { font-size: 7pt; color: #333; letter-spacing: 0.5px; text-align: center; }
    .certis-block { text-align: right; }
    .certis-block h2 { font-size: 11pt; font-weight: 700; margin-bottom: 6px; }
    .certis-block p { font-size: 10pt; margin-bottom: 3px; }
    .certis-block span { display: inline-block; width: 55px; font-weight: 600; }

    /* ── Title ── */
    .form-title { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 4px 0; }
    .form-title .ite-name { color: #e67e00; font-weight: 700; font-size: 11pt; }
    .form-title .list-label { font-weight: 700; font-size: 11pt; }

    /* ── Tables ── */
    .order-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .order-table th, .order-table td { border: 1px solid #000; padding: 2.5px 6px; }
    .order-table thead th { background: #f0f0f0; font-weight: 700; font-size: 10pt; text-align: left; }
    .sno  { width: 36px; text-align: center; }
    .qty  { width: 52px; text-align: center; }
    .desc { text-align: left; }
    .order-table tbody tr:nth-child(even) { background: #fafafa; }

    /* ── Footer ── */
    .footer { margin-top: 16px; }
    .footer-field { display: flex; align-items: baseline; margin-bottom: 10px; border-bottom: 1px solid #000; padding-bottom: 2px; }
    .footer-label { font-weight: 700; min-width: 180px; font-size: 10.5pt; }
    .footer-value { font-size: 10.5pt; flex: 1; }
    .sig-area { margin-top: 40px; display: flex; align-items: flex-end; gap: 30px; }
    .sig-line { flex: 1; border-top: 1px solid #000; padding-top: 4px; font-size: 9pt; }
    .stamp-circle { width: 80px; height: 80px; border-radius: 50%; border: 1.5px dashed #999; display: flex; align-items: center; justify-content: center; font-size: 8pt; color: #999; text-align: center; flex-shrink: 0; }

    @media print {
      body { padding: 10mm 12mm 8mm; }
      .order-table tbody tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <div class="page-header">
    <div class="ite-logo-box">
      <div class="ite-logo-top">ITE</div>
      <div class="ite-logo-sub">ELECTRIC<br>GROUP</div>
    </div>
    <div class="certis-block">
      <h2>CERTIS TECHNOLOGY (SINGAPORE) PTE LTD</h2>
      <p><span>REF :</span> ${order.ref ?? ''}</p>
      <p><span>DATE :</span> ${fmtDate(order.date)}</p>
    </div>
  </div>

  <div class="form-title">
    <span class="ite-name">ITE ELECTRIC SYSTEMS CO PTE. LTD.</span>
    <span class="list-label">ORDERING LIST</span>
  </div>

  ${tablesHtml}

  <div class="footer">
    <div class="footer-field">
      <span class="footer-label">Company Name :</span>
      <span class="footer-value">WA! NETWORK ASIA</span>
    </div>
    <div class="footer-field">
      <span class="footer-label">Order Person :</span>
      <span class="footer-value">Andy Ng</span>
    </div>
    <div class="footer-field">
      <span class="footer-label">Site Contact Person :</span>
      <span class="footer-value">${order.siteContact ?? ''}</span>
    </div>
    <div class="footer-field">
      <span class="footer-label">Delivery Address :</span>
      <span class="footer-value">${order.deliveryAddress ?? ''}</span>
    </div>
    <div class="sig-area">
      <div>
        <div style="height:50px;"></div>
        <div class="sig-line">Authorised Signature &amp; Company Stamp</div>
      </div>
      <div class="stamp-circle">Company<br>Stamp</div>
    </div>
  </div>

</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}
