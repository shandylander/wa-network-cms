// Parser for daily WhatsApp work-status reports.
//
// Real reports are messy — different separators (- _ space, none at all),
// inconsistent casing, leading *** on active blocks, cam08 with zero padding,
// missing fix values. Examples this handles:
//   351 fix1-90% fix2-90% fix3-0 fix4-0 cam6(O)
//   356-Fix1_90%Fix2-80%Fix3-0Fix4-0cam6(O)
//   ***354A- fix1-90% fix2-90% fix3-30% fix4-0 cam6(O)
//   365-Fix1-60%Fix2-0 Fix3-0 Fix4Cam13(O)   (fix4 value missing → unchanged)

const FIX_RE = (n) =>
  new RegExp(`fix\\s*[-_ ]?${n}\\s*[-_:. ]*([0-9]{1,3})\\s*%?`, 'i');

const CAM_RE   = /cam\s*[-_ ]?0*(\d+)\s*\(\s*([oi])\s*\)/i;
// Block suffix letter (354A) must not be followed by another letter, so
// "359fix1-90%" parses as block 359 and not "359F".
const BLOCK_RE = /^\s*(\*+)?\s*(\d{1,4}(?:[A-Za-z](?![A-Za-z]))?)\s*[-_–—.:]*\s*(.*)$/;

export function parseReportLine(line) {
  const m = line.match(BLOCK_RE);
  if (!m) return null;
  const rest = m[3] ?? '';
  // A block line must mention at least one fix stage
  if (!/fix\s*[-_ ]?[1-4]/i.test(rest)) return null;

  const entry = {
    no: m[2].toUpperCase(),
    active: Boolean(m[1]),
    fix1: null, fix2: null, fix3: null, fix4: null,
    cam: null, rack: null,
  };

  for (let i = 1; i <= 4; i++) {
    const fm = rest.match(FIX_RE(i));
    if (fm) entry[`fix${i}`] = Math.min(100, parseInt(fm[1], 10));
  }

  const cm = rest.match(CAM_RE);
  if (cm) {
    entry.cam  = parseInt(cm[1], 10);
    entry.rack = cm[2].toUpperCase();
  }

  return entry;
}

// Returns { entries, skipped }. `skipped` lists non-empty lines that were
// neither parsed as blocks nor recognised as headers, so the user can check
// nothing was silently dropped.
export function parseReport(text) {
  const entries = [];
  const skipped = [];

  const HEADER_RE = /daily work status|cluster start date/i;

  (text ?? '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (HEADER_RE.test(line)) return;

    const entry = parseReportLine(line);
    if (entry) {
      entries.push(entry);
    } else if (/fix\s*[-_ ]?[1-4]|cam\s*\d/i.test(line)) {
      // Looked like a block line but could not be parsed — surface it
      skipped.push(line);
    } else if (!/^[a-z\s.,()'&\d/]+$/i.test(line) || /\d{3}/.test(line)) {
      // Not an obvious street/header line — surface it to be safe
      skipped.push(line);
    }
    // else: street names / free text headers are silently ignored
  });

  return { entries, skipped };
}
