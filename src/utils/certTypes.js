// Certificate type defaults and expiry helpers, shared by the Workers pages.
// The live list is admin-editable and stored at appConfig/certTypes; these
// defaults are used until first save (and as fallback if the read fails).

export const DEFAULT_CERT_TYPES = [
  { key: 'scissor-lift', label: 'Scissor Lift', short: 'SL'   },
  { key: 'bcss',         label: 'BCSS',         short: 'BCSS' },
  { key: 'csoc',         label: 'CSOC',         short: 'CSOC' },
  { key: 'work-permit',  label: 'Work Permit',  short: 'WP'   },
  { key: 'manage-wah',   label: 'Manage WAH',   short: 'WAH'  },
];

// 'valid' | 'expiring' (≤30 days) | 'expired' | 'none' (no expiry set)
export const certStatus = (expiry) => {
  if (!expiry) return 'none';
  const days = Math.floor((new Date(expiry) - new Date()) / 86400000);
  if (days < 0)   return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
};

// Short chip label for a cert: configured short code, else abbreviate the name
export const certShort = (cert, certTypes) => {
  const t = certTypes.find(x => x.key === cert.type);
  if (t) return t.short;
  const name = (cert.name ?? '').trim();
  return name.length <= 6 ? name : name.split(/\s+/)[0].slice(0, 6);
};

export const certLabel = (cert, certTypes) =>
  certTypes.find(x => x.key === cert.type)?.label ?? cert.name ?? 'Certificate';
