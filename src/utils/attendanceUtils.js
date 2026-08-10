import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const fileToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/* ── GPS ─────────────────────────────────────────────────────────── */

export const getLocation = () =>
  new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: Math.round(coords.accuracy) }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  );

export const reverseGeocode = async (lat, lng) => {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    // Return block + road + suburb (compact Singapore address)
    const parts = [data.address?.road, data.address?.suburb || data.address?.town].filter(Boolean);
    return parts.length ? parts.join(', ') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
};

/* ── Photo upload ────────────────────────────────────────────────── */

export const uploadSelfie = async (blob, userId, date, type) => {
  const data = await fileToBase64(blob);
  const callable = httpsCallable(functions, 'uploadUserFile', { timeout: 60000 });
  const res = await callable({
    data, mimeType: 'image/jpeg', category: 'attendance',
    userId, date, fileName: `${type}-${Date.now()}.jpg`,
  });
  return res.data.url;
};

/* ── Time helpers ────────────────────────────────────────────────── */

export const todaySG = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());

export const nowSG = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date());

export const fmtTime = (ts) => {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
};

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Convert a stored timestamp to an HH:mm string in Singapore time, for pre-filling <input type="time">
export const timeInputSG = (ts) => {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
};

export const calcHours = (inTs, outTs) => {
  if (!inTs || !outTs) return null;
  const inD  = inTs?.toDate  ? inTs.toDate()  : new Date(inTs);
  const outD = outTs?.toDate ? outTs.toDate() : new Date(outTs);
  const diff = (outD - inD) / 3600000;
  return Math.max(0, Math.round(diff * 10) / 10);
};

export const mapsLink = (lat, lng) =>
  `https://www.google.com/maps?q=${lat},${lng}`;
