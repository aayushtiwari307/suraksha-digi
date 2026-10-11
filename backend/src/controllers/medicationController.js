// src/controllers/medicationController.js

const Medication = require('../models/Medication');
const MedicationLog = require('../models/MedicationLog');
const { userOwnsElder } = require('../utils/ownership');
const { validateMedication, isValidObjectId } = require('../utils/validators');
const { getISTDateString, addDaysToISTDateString, isDateInRange } = require('../utils/istTime');

// Today's date, IST-aware — see utils/istTime.js. Replaces the old
// `toISOString().split('T')[0]` which was UTC-based and could disagree
// with the actual IST calendar date for the first ~5.5 hours of the day.
const getTodayDate = () => getISTDateString();

// POST /api/medications/add — family only
const addMedication = async (req, res) => {
  try {
    const validation = validateMedication(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { elderId, medicineName, dosage, scheduledTime, frequency, durationDays, endDate } = req.body;
    const createdBy = req.user.id;

    // Duration window, IST calendar dates. startDate is always "today"
    // at creation time. endDate: explicit durationDays preset -> start +
    // (days-1) so a "1 day" medication covers only its start date;
    // explicit custom endDate -> used as-is; neither -> null (indefinite
    // / "until stopped").
    const startDate = getTodayDate();
    let resolvedEndDate = null;
    if (durationDays !== undefined) {
      resolvedEndDate = addDaysToISTDateString(startDate, durationDays - 1);
    } else if (endDate !== undefined) {
      if (endDate < startDate) {
        return res.status(400).json({
          success: false,
          message: 'End date cannot be before the medication start date'
        });
      }
      resolvedEndDate = endDate;
    }

    const medication = await Medication.create({
      elderId,
      medicineName,
      dosage,
      scheduledTime,
      frequency: frequency || 'daily',
      createdBy,
      startDate,
      endDate: resolvedEndDate,
    });

    res.status(201).json({ message: 'Medication added successfully', medication });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/medications/elder/:elderId — family or elder
const getTodayMedications = async (req, res) => {
  try {
    const { elderId } = req.params;
    const today = getTodayDate();

    const medications = await Medication.find({ elderId, isActive: true });

    // Only medications currently within their duration window appear as
    // "today's medications" — a future-start or expired medication is
    // filtered out here rather than deleted, so historical logs from
    // when it WAS active stay intact and queryable.
    const activeToday = medications.filter(med => isDateInRange(today, med.startDate, med.endDate));

    const result = await Promise.all(
      activeToday.map(async (med) => {
        let log = await MedicationLog.findOne({
          medicationId: med._id,
          date: today,
        });

        if (!log) {
          try {
            log = await MedicationLog.create({
              medicationId: med._id,
              elderId,
              date: today,
              status: 'pending',
            });
          } catch (createError) {
            // The scheduler can create the same log concurrently. The
            // compound unique index is the final guard; on a duplicate,
            // re-fetch and continue normally instead of returning 500.
            if (createError?.code !== 11000) throw createError;
            log = await MedicationLog.findOne({
              medicationId: med._id,
              date: today,
            });
            if (!log) throw createError;
          }
        }

        // Missed-detection + alert creation no longer happens here — a
        // GET should read, not run AI calls and write Alert records as a
        // side effect. That's now jobs/missedMedicationJob.js, which runs
        // on its own schedule regardless of whether anyone opens this
        // dashboard. This handler only reflects whatever status the log
        // currently has.

        return {
          medicationId: med._id,
          medicineName: med.medicineName,
          dosage: med.dosage,
          scheduledTime: med.scheduledTime,
          frequency: med.frequency,
          startDate: med.startDate,
          endDate: med.endDate,
          logId: log._id,
          status: log.status,
          takenAt: log.takenAt || null,
        };
      })
    );

    res.status(200).json({ date: today, medications: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/medications/mark-taken/:medicationId — family or elder
const markTaken = async (req, res) => {
  try {
    const { medicationId } = req.params;

    if (!isValidObjectId(medicationId)) {
      return res.status(400).json({ success: false, message: 'Invalid medication ID' });
    }

    const today = getTodayDate();
    const markedBy = req.user.id;
    const markedByRole = req.user.role === 'family' ? 'Family' : 'Elder';

    let log = await MedicationLog.findOne({ medicationId, date: today });

    if (!log) {
      return res.status(404).json({ message: 'No log found for today' });
    }

    if (!userOwnsElder(req.user, log.elderId)) {
      return res.status(403).json({ message: 'Not authorized to update this medication log' });
    }

    log.status = 'taken';
    log.markedBy = markedBy;
    log.markedByRole = markedByRole;
    log.takenAt = new Date();
    await log.save();

    res.status(200).json({ message: 'Marked as taken', log });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { addMedication, getTodayMedications, markTaken };
