const SGT = { timeZone: 'Asia/Singapore' };

export const formatDate = (timestamp) => {
  if (!timestamp) return '—';
  const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('en-SG', { day: '2-digit', month: 'short', year: 'numeric', ...SGT }).format(d);
};

export const formatDateTime = (timestamp) => {
  if (!timestamp) return '—';
  const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, ...SGT,
  }).format(d);
};

export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '—';
  const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(timestamp);
};

// Today's date in Singapore time, as YYYY-MM-DD — safe default for <input type="date">
export const todayInputSG = () =>
  new Intl.DateTimeFormat('en-CA', { ...SGT, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// "Now" in Singapore time, as YYYY-MM-DDTHH:mm — safe default for <input type="datetime-local">
export const nowDateTimeInputSG = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...SGT, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};

// Convert a stored timestamp to YYYY-MM-DD in Singapore time — for pre-filling <input type="date"> on edit
export const toDateInputSG = (timestamp) => {
  if (!timestamp) return '';
  const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat('en-CA', { ...SGT, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

// Build a JS Date from a YYYY-MM-DD date + HH:mm time, interpreted as Singapore wall-clock time
export const sgWallClockToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00+08:00`);

export const getStageStatus = (block) => {
  const { fix1 = 0, fix2 = 0, fix3 = 0, fix4 = 0 } = block;
  if (fix1 === 100 && fix2 === 100 && fix3 === 100 && fix4 === 100) return 'stage2-complete';
  if (fix1 === 100 && fix2 === 100) return 'stage1-complete';
  if (fix1 > 0 || fix2 > 0 || fix3 > 0 || fix4 > 0) return 'in-progress';
  return 'not-started';
};

export const getOverallProgress = (block) => {
  const { fix1 = 0, fix2 = 0, fix3 = 0, fix4 = 0 } = block;
  return Math.round((fix1 + fix2 + fix3 + fix4) / 4);
};

export const generateWhatsAppReport = (block) => {
  const { no, fix1 = 0, fix2 = 0, fix3 = 0, fix4 = 0, cam = 0, rack = 'O' } = block;
  return `${no} | fix1-${fix1}% fix2-${fix2}% fix3-${fix3}% fix4-${fix4}% | cam${cam}(${rack})`;
};

export const getSurveyLabel = (survey) =>
  ({ done: 'Surveyed', ip: 'In Progress', bto: 'BTO' }[survey] ?? survey);

export const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

export const greet = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { ...SGT, hour: '2-digit', hour12: false }).format(new Date()));
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};
