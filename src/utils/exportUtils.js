// ============================================================================
// Shared client-side CSV export utilities.
// Used by the payroll module (Phase 3a) and payroll reporting (Phase 3b).
// Pure string-building is separated from the DOM download so it can be tested
// in a non-browser environment.
// ============================================================================

// UTF-8 byte-order mark so Excel opens SGD "$", unicode names, etc. correctly.
const BOM = '﻿';

/**
 * Escape a single CSV field per RFC 4180.
 * Wraps in double-quotes when the value contains a comma, quote, CR or LF,
 * and doubles any embedded quotes.
 */
export const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

/**
 * Build a CSV string (no BOM) from columns + rows. Pure — safe to unit test.
 * @param {{key:string,label:string}[]} columns
 * @param {Object[]} rows
 * @returns {string} CSV text with CRLF line endings
 */
export const buildCsv = (columns, rows) => {
  const cols = columns ?? [];
  const header = cols.map((c) => escapeCsvField(c.label ?? c.key)).join(',');
  const body = (rows ?? []).map((row) =>
    cols.map((c) => escapeCsvField(row?.[c.key])).join(',')
  );
  return [header, ...body].join('\r\n');
};

/**
 * Trigger a client-side CSV download via Blob + object URL.
 * @param {string} filename  e.g. 'payroll-2026-07.csv' ('.csv' appended if missing)
 * @param {{key:string,label:string}[]} columns
 * @param {Object[]} rows
 * @returns {boolean} true if the download was initiated
 */
export const downloadCsv = (filename, columns, rows) => {
  if (typeof document === 'undefined') return false; // guard non-browser
  const csv = BOM + buildCsv(columns, rows);
  const name = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};
