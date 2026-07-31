// src/controllers/medicationController.js

const Medication = require('../models/Medication');
const MedicationLog = require('../models/MedicationLog');
const Alert = require('../models/Alert');

// Helper — today's date as "YYYY-MM-DD"
const getTodayDate = () => new Date().toISOString().split('T')[0];

// Helper — check if medication is missed (current time > scheduledTime + 30 min grace)
const isMissed = (scheduledTime) => {
  const now = new Date();
  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const scheduled = new Date();
  scheduled.setHours(hours, minutes, 0, 0);
  const grace = new Date(scheduled.getTime() + 30 * 60 * 1000);
  return now > grace;
};

// POST /api/medications/add — family only
const addMedication = async (req, res) => {
  try {
    const { elderId, medicineName, dosage, scheduledTime, frequency } = req.body;
    const createdBy = req.user.id;

    const medication = await Medication.create({
      elderId,
      medicineName,
      dosage,
      scheduledTime,
      frequency: frequency || 'daily',
      createdBy,
    });

    res.status(201).json({ message: 'Medication added successfully', medication });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/medications/elder/:elderId — family or elder
const getTodayMedications = async (req, res) => {
  try {
    const { elderId } = req.params;
    const today = getTodayDate();

    const medications = await Medication.find({ elderId, isActive: true });

    const result = await Promise.all(
      medications.map(async (med) => {
        let log = await MedicationLog.findOne({
          medicationId: med._id,
          date: today,
        });

        if (!log) {
          log = await MedicationLog.create({
            medicationId: med._id,
            elderId,
            date: today,
            status: 'pending',
          });
        }

        if (log.status === 'pending' && isMissed(med.scheduledTime)) {
          log.status = 'missed';
          await log.save();

          await Alert.create({
            elderId,
            type: 'medication_missed',
            severity: 'medium',
            message: `${med.medicineName} (${med.scheduledTime}) was not taken by the elder.`,
          });
        }

        return {
          medicationId: med._id,
          medicineName: med.medicineName,
          dosage: med.dosage,
          scheduledTime: med.scheduledTime,
          frequency: med.frequency,
          logId: log._id,
          status: log.status,
          takenAt: log.takenAt || null,
        };
      })
    );

    res.status(200).json({ date: today, medications: result });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// PUT /api/medications/mark-taken/:medicationId — family or elder
const markTaken = async (req, res) => {
  try {
    const { medicationId } = req.params;
    const today = getTodayDate();
    const markedBy = req.user.id;
    const markedByRole = req.user.role === 'family' ? 'Family' : 'Elder';

    let log = await MedicationLog.findOne({ medicationId, date: today });

    if (!log) {
      return res.status(404).json({ message: 'No log found for today' });
    }

    log.status = 'taken';
    log.markedBy = markedBy;
    log.markedByRole = markedByRole;
    log.takenAt = new Date();
    await log.save();

    res.status(200).json({ message: 'Marked as taken', log });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { addMedication, getTodayMedications, markTaken };