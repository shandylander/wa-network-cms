import { Timestamp } from 'firebase/firestore';
import { getLocation, reverseGeocode } from '../../utils/attendanceUtils';

// GPS + timestamp for check-in/out — degrades gracefully to a bare
// timestamp if location access fails/is denied, same as WorkerClock.jsx's
// handling of a failed getLocation() call.
export async function stamp() {
  const time = Timestamp.now();
  try {
    const loc = await getLocation();
    const address = await reverseGeocode(loc.lat, loc.lng).catch(() => '');
    return { time, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, address };
  } catch {
    return { time, lat: null, lng: null, accuracy: null, address: null };
  }
}
