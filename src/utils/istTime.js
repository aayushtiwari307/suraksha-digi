// Single source of truth for IST-aware date/time logic.
//
// The hosting server's own timezone (Render defaults to UTC) must never
// leak into scheduling/date-key decisions. Everything here computes
// explicitly against Asia/Kolkata (fixed UTC+5:30, India has no DST),
// regardless of what timezone the Node process itself is running in.
//
// Two things previously depended on server-local time and were wrong:
//   1. Missed-medication detection used `new Date().setHours()`, which
//      is server-local, not IST.
//   2. The daily log key used `toISOString()`, which is UTC — meaning
//      for the first ~5.5 hours of every IST day, "today" resolved to
//      the wrong calendar date.
// Both are fixed by routing through this file instead of touching
// Date's local-timezone methods directly.

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

// A Date whose UTC getters (getUTCHours, getUTCDate, etc.) read as IST
// wall-clock values — regardless of the server's own timezone. Its
// .getTime() lives on a shifted numberline; scheduledMomentIST() below
// builds comparable timestamps on that same numberline.
const nowInIST = () => new Date(Date.now() + IST_OFFSET_MS);

// "YYYY-MM-DD" for "today" in IST — used as MedicationLog.date.
const getISTDateString = (date = nowInIST()) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Builds the actual IST timestamp for `scheduledTime` ("HH:MM") on the
// given IST calendar date (normally the log's own date key). Using
// Date.UTC with IST wall-clock numbers puts this on the same shifted
// numberline as nowInIST(), so adding grace-period milliseconds
// afterwards rolls correctly into the next calendar day — real
// timestamp arithmetic, not a minutes-of-day comparison (which is what
// broke for schedules like 23:45 + 30min grace).
const scheduledMomentIST = (scheduledTime, forDateString) => {
  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const [y, m, d] = forDateString.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hours, minutes, 0, 0);
};

// True once (scheduledTime, on forDateString's IST calendar day) +
// graceMinutes has passed, compared against the current IST instant.
// Correctly handles grace periods that cross midnight.
const isPastGraceInIST = (scheduledTime, graceMinutes = 30, forDateString = getISTDateString()) => {
  const scheduledTs = scheduledMomentIST(scheduledTime, forDateString);
  const graceTs = scheduledTs + graceMinutes * 60 * 1000;
  return nowInIST().getTime() > graceTs;
};

// "9:00 AM" / "9:00 PM" — display formatting only, never used for logic.
const formatTimeAMPM = (scheduledTime) => {
  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
};

// Calendar-date arithmetic for medication duration — "YYYY-MM-DD" + N
// days -> "YYYY-MM-DD". Pure date-string math (Date.UTC handles month/
// year rollover correctly), not a real-time clock read, so it's safe to
// use regardless of when it's called.
const addDaysToISTDateString = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  const ry = result.getUTCFullYear();
  const rm = String(result.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(result.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
};

// Is `dateStr` within [startDate, endDate] (both "YYYY-MM-DD", endDate
// nullable = indefinite/until stopped)? Plain string comparison is safe
// here since ISO date strings sort lexicographically the same as they
// sort chronologically.
// Backward-compatible: a missing/undefined startDate (medications that
// existed before duration support was added) is treated as always
// active rather than excluded or throwing — noted explicitly since this
// affects which pre-existing medications keep appearing after this
// change ships.
const isDateInRange = (dateStr, startDate, endDate) => {
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
};

module.exports = {
  nowInIST,
  getISTDateString,
  isPastGraceInIST,
  formatTimeAMPM,
  addDaysToISTDateString,
  isDateInRange,
};
