// Pure date and data helpers for the siskamling website.
// No DOM, no fetch of its own, no locale-dependent APIs — safe to unit test.

export const WEEKDAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTHS_LOWER = MONTHS_ID.map((m) => m.toLowerCase());
const WITA_OFFSET_MS = 8 * 3600e3; // Asia/Makassar is UTC+8, no DST

// Date keys are plain {y, m, d} objects with 1-based months.

/** Current date in WITA (UTC+8) regardless of the device timezone. */
export function witaDate(ms = Date.now()) {
  const shifted = new Date(ms + WITA_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

export function toUTC(k) {
  return new Date(Date.UTC(k.y, k.m - 1, k.d));
}

export function fromUTC(dt) {
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addDays(k, n) {
  return fromUTC(new Date(toUTC(k).getTime() + n * 86400e3));
}

/** First day (Monday) of the week containing k. */
export function startOfWeek(k) {
  return addDays(k, -((toUTC(k).getUTCDay() + 6) % 7));
}

/** The seven {y, m, d} days Monday..Sunday of the week containing k. */
export function weekDates(k) {
  const monday = startOfWeek(k);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dateKey(k) {
  return `${k.y}-${String(k.m).padStart(2, '0')}-${String(k.d).padStart(2, '0')}`;
}

/**
 * Parse "Kamis, 1 Oktober 2026" into {y, m, d}. Explicit table-based parsing:
 * never relies on browser locale. Returns null for anything that does not
 * match the exact format, has an impossible day, or a weekday name that does
 * not match the actual weekday of the parsed date.
 */
export function parseIndonesianDate(str) {
  if (typeof str !== 'string') return null;
  const match = str.match(/^([A-Za-z]+), (\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (!match) return null;
  const [, weekday, dayStr, monthName, yearStr] = match;
  const m = MONTHS_LOWER.indexOf(monthName.toLowerCase());
  if (m === -1) return null;
  const d = Number(dayStr);
  const y = Number(yearStr);
  if (d < 1 || d > daysInMonth(y, m + 1)) return null;
  const k = { y, m: m + 1, d };
  const days = Math.round(toUTC(k).getTime() / 86400e3);
  if (WEEKDAYS_ID[(days + 3) % 7] !== weekday) return null; // 1970-01-01 was Kamis
  return k;
}

/** Format {y, m, d} as "Kamis, 1 Oktober 2026". */
export function formatDateIndonesian(k) {
  const days = Math.round(toUTC(k).getTime() / 86400e3);
  return `${WEEKDAYS_ID[(days + 3) % 7]}, ${k.d} ${MONTHS_ID[k.m - 1]} ${k.y}`;
}

/** assets/schedules/ file name for a month, e.g. (2026, 10) -> siskamling-schedule-oktober-2026.json */
export function scheduleFileName(year, month) {
  return `siskamling-schedule-${MONTHS_LOWER[month - 1]}-${year}.json`;
}

/** Strict validation of the monthly schedule schema. Null leader is allowed. */
export function isValidSchedule(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    if (typeof entry.name !== 'string' || entry.name.length === 0) return false;
    if (parseIndonesianDate(entry.date) === null) return false;
    if (entry.leader !== null && typeof entry.leader !== 'string') return false;
    if (!Array.isArray(entry.members) || !entry.members.every((n) => typeof n === 'string')) return false;
    return true;
  });
}

/**
 * Fetch one month with distinct outcomes:
 *   {status: 'ok', schedule}  — parsed and validated
 *   {status: 'missing'}       — 404: month not published yet
 *   {status: 'error'}         — network failure, HTTP error, or invalid payload
 * fetchFn defaults to global fetch; inject a fake in tests.
 */
export async function loadMonth(fetchFn = fetch, year, month) {
  let res;
  try {
    res = await fetchFn(scheduleFileName(year, month));
  } catch {
    return { status: 'error' };
  }
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) return { status: 'error' };
  let data;
  try {
    data = await res.json();
  } catch {
    return { status: 'error' };
  }
  if (!isValidSchedule(data)) return { status: 'error' };
  return { status: 'ok', schedule: data };
}

/** Map exact roster name -> houseNumber (string or null). */
export function peopleIndex(entries) {
  return new Map(entries.map((p) => [p.name, p.houseNumber]));
}

/** Exact-name lookup; never fuzzy. Missing or null house number -> fallback text. */
export function houseNumberFor(index, name) {
  const house = index.get(name);
  return house ?? 'Belum tersedia';
}
