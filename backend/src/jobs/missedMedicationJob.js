// Background medication monitor. This job is deliberately small and
// single-process: no Redis, queues, workers, or external scheduler.
const cron = require('node-cron');
const Medication = require('../models/Medication');
const MedicationLog = require('../models/MedicationLog');
const Elder = require('../models/Elder');
const { callGemini } = require('../config/gemini');
const {
  getISTDateString,
  addDaysToISTDateString,
  isPastGraceInIST,
  isDateInRange,
  formatTimeAMPM,
} = require('../utils/istTime');
const { createAlertWithScoreUpdate } = require('../services/alertService');

let jobRunning = false;

const formatDateForAlert = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

const getScheduledDateTimeText = (dateString, scheduledTime) =>
  `${formatTimeAMPM(scheduledTime)} on ${formatDateForAlert(dateString)}`;

const getScheduledPeriodHindi = (scheduledTime) => {
  const hour = Number(scheduledTime.split(':')[0]);
  if (hour < 12) return 'सुबह';
  if (hour < 17) return 'दोपहर';
  return 'शाम';
};

const buildMedFallback = (medicineName, scheduledTime, dosage, dateString, englishMessage, hindiMessage) => {
  const scheduledDateTime = getScheduledDateTimeText(dateString, scheduledTime);
  const timeOnlyHindi = formatTimeAMPM(scheduledTime).replace(/ AM| PM/, '');
  return {
    message: englishMessage || `${medicineName} (${dosage}) scheduled for ${scheduledDateTime} was not marked as taken.`,
    messageHindi: hindiMessage || `${medicineName} (${dosage}) की दवाई ${timeOnlyHindi} ${getScheduledPeriodHindi(scheduledTime)} को नहीं ली गई।`,
  };
};

// PASS 1 — ensure logs exist for the two dates the job may need to process:
// today and yesterday. Yesterday is required for a late-night dose whose
// grace period crosses midnight, and also lets the job recover a just-ended
// medication day without resurrecting an unlimited historical backlog.
const ensureRelevantLogs = async (today) => {
  const yesterday = addDaysToISTDateString(today, -1);
  const relevantDates = [yesterday, today];
  const activeMedications = await Medication.find({ isActive: true });

  // A deactivated elder (family.setElderStatus) should not keep
  // accumulating new medication logs / missed alerts / safetyScore
  // drops in the background — the fraud pipeline already enforces this
  // (fraudService.processTransaction rejects inactive elders); the
  // medication scheduler needs the same rule for consistent behavior.
  // Existing already-pending logs from before deactivation are left
  // alone here (pass 2 still resolves them), matching how an expired
  // medication's final-day log is still honored — only NEW log creation
  // stops, nothing already legitimately pending is abandoned.
  const elderIds = [...new Set(activeMedications.map(med => med.elderId.toString()))];
  const inactiveElders = await Elder.find({ _id: { $in: elderIds }, isActive: false }).select('_id');
  const inactiveElderIds = new Set(inactiveElders.map(e => e._id.toString()));

  for (const med of activeMedications) {
    if (inactiveElderIds.has(med.elderId.toString())) continue;

    for (const date of relevantDates) {
      if (!isDateInRange(date, med.startDate, med.endDate)) continue;

      try {
        const existing = await MedicationLog.findOne({ medicationId: med._id, date });
        if (!existing) {
          await MedicationLog.create({
            medicationId: med._id,
            elderId: med.elderId,
            date,
            status: 'pending',
          });
        }
      } catch (error) {
        console.error(`[missedMedicationJob] failed to ensure log for medication ${med._id} on ${date}:`, error.message);
      }
    }
  }
};

const processOneLog = async (log) => {
  const med = await Medication.findById(log.medicationId);
  if (!med) {
    console.error(`[missedMedicationJob] medication ${log.medicationId} not found for log ${log._id} — skipping`);
    return;
  }

  if (log.status === 'pending') {
    if (!isPastGraceInIST(med.scheduledTime, 30, log.date)) return;
    log.status = 'missed';
    await log.save();
  }

  // `alertCreated !== true` also covers old MedicationLogs created before
  // the alertCreated field existed, so the new scheduler remains compatible
  // with existing database records.
  if (log.status !== 'missed' || log.alertCreated === true) return;

  const scheduledDateTime = getScheduledDateTimeText(log.date, med.scheduledTime);
  const timeOnlyHindi = formatTimeAMPM(med.scheduledTime).replace(/ AM| PM/, '');
  const hindiPeriod = getScheduledPeriodHindi(med.scheduledTime);

  const englishPrompt = `You are a caring assistant for elderly Indian users.
An elderly person missed their ${med.medicineName} (${med.dosage}) scheduled for ${scheduledDateTime}.
Write a short, warm, caring alert message in English for their family member.
Keep it under 2 sentences. Be gentle and informative.`;

  const hindiPrompt = `आप एक बुजुर्ग भारतीय उपयोगकर्ताओं के लिए एक देखभाल करने वाले सहायक हैं।
एक बुजुर्ग व्यक्ति ने ${med.medicineName} (${med.dosage}) की दवाई ${timeOnlyHindi} ${hindiPeriod}, ${formatDateForAlert(log.date)} को नहीं ली।
उनके परिवार के सदस्य के लिए हिंदी में एक छोटा, गर्मजोशी भरा संदेश लिखें।
2 वाक्यों से कम रखें। विनम्र और देखभाल करने वाले स्वर में लिखें।`;

  const [englishMessage, hindiMessage] = await Promise.all([
    callGemini(englishPrompt),
    callGemini(hindiPrompt),
  ]);

  const { message, messageHindi } = buildMedFallback(
    med.medicineName,
    med.scheduledTime,
    med.dosage,
    log.date,
    englishMessage,
    hindiMessage
  );

  const elder = await Elder.findById(med.elderId);
  if (!elder) {
    console.error(`[missedMedicationJob] elder ${med.elderId} not found for medication ${med._id} — skipping alert`);
    return;
  }

  // sourceType/sourceId make this event idempotent even if a prior alert
  // already exists, while the alert service transaction keeps alert creation
  // and safety-score update atomic.
  await createAlertWithScoreUpdate(elder, {
    elderId: med.elderId,
    type: 'medication_missed',
    severity: 'medium',
    message,
    messageHindi,
    sourceType: 'medication',
    sourceId: log._id,
  });

  log.alertCreated = true;
  await log.save();
};

// Only today + yesterday are scanned. This is enough to catch the midnight
// rollover case without processing an unlimited historical backlog.
const processOutstandingLogs = async (today) => {
  const yesterday = addDaysToISTDateString(today, -1);
  const logs = await MedicationLog.find({
    date: { $gte: yesterday, $lte: today },
    $or: [
      { status: 'pending' },
      { status: 'missed', alertCreated: { $ne: true } },
    ],
  });

  for (const log of logs) {
    try {
      await processOneLog(log);
    } catch (error) {
      console.error(`[missedMedicationJob] error processing log ${log._id}:`, error.message);
    }
  }
};

const runMissedMedicationCheck = async () => {
  if (jobRunning) {
    console.log('[missedMedicationJob] previous run still active — skipping this tick');
    return;
  }

  jobRunning = true;
  try {
    const today = getISTDateString();
    await ensureRelevantLogs(today);
    await processOutstandingLogs(today);
  } catch (error) {
    console.error('[missedMedicationJob] run failed:', error.message);
  } finally {
    jobRunning = false;
  }
};

const startMissedMedicationJob = () => {
  cron.schedule('*/5 * * * *', runMissedMedicationCheck);
  console.log('[missedMedicationJob] scheduled every 5 minutes (IST-aware)');
};

module.exports = { startMissedMedicationJob, runMissedMedicationCheck };
