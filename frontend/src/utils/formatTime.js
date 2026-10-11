// Display-only formatter: "HH:MM" (24hr, as stored/submitted by the
// native <input type="time">) -> "9:00 AM" / "9:00 PM". Never used for
// any scheduling logic — that lives entirely on the backend.
export const formatTimeAMPM = (scheduledTime) => {
  if (!scheduledTime) return '';
  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
};
