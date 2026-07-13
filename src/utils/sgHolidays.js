// Singapore gazetted public holidays — pure data + lookup helpers, no
// Firestore dependency. Sourced from the Ministry of Manpower
// (https://www.mom.gov.sg/employment-practices/public-holidays) and the
// official data.gov.sg public holidays dataset (d_149b61ad0a22f61c09dc80f2df5bbec8).
//
// IMPORTANT — this file only covers 2026. Every year, add a new
// SG_HOLIDAYS_<year> array below (Hari Raya Puasa/Haji, Vesak Day and
// Deepavali shift each year with the Islamic/lunar calendars and cannot be
// derived programmatically) and push it into ALL_HOLIDAYS.

export const SG_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-02-17', name: 'Chinese New Year' },
  { date: '2026-02-18', name: 'Chinese New Year' },
  { date: '2026-03-21', name: 'Hari Raya Puasa' },   // VERIFY — moon-sighting dependent; cross-checked against MOM + data.gov.sg at time of writing
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-27', name: 'Hari Raya Haji' },    // VERIFY — moon-sighting dependent; cross-checked against MOM + data.gov.sg at time of writing
  { date: '2026-05-31', name: 'Vesak Day' },
  // Vesak Day, National Day and Deepavali all fall on a Sunday in 2026, so the
  // following Monday is gazetted as the holiday-in-lieu (the actual non-working
  // day). Both dates are listed: the Sunday reads as a weekend on the calendar,
  // the Monday is the day staff are actually off.
  { date: '2026-06-01', name: 'Vesak Day (observed)' },
  { date: '2026-08-09', name: 'National Day' },
  { date: '2026-08-10', name: 'National Day (observed)' },
  { date: '2026-11-08', name: 'Deepavali' },
  { date: '2026-11-09', name: 'Deepavali (observed)' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

// Append SG_HOLIDAYS_2027 etc. here as they're added.
const ALL_HOLIDAYS = [...SG_HOLIDAYS_2026];

const HOLIDAY_MAP = ALL_HOLIDAYS.reduce((map, h) => {
  map[h.date] = h.name;
  return map;
}, {});

// dateStr: 'YYYY-MM-DD'
export const isHoliday = (dateStr) =>
  Object.prototype.hasOwnProperty.call(HOLIDAY_MAP, dateStr);

export const holidayName = (dateStr) => HOLIDAY_MAP[dateStr] ?? null;
