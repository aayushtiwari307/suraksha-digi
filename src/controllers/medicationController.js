// src/controllers/medicationController.js

const Medication = require('../models/Medication');
const MedicationLog = require('../models/MedicationLog');
const Alert = require('../models/Alert');
const { callGemini } = require('../config/gemini');
const { userOwnsElder } = require('../utils/ownership');
const { validateMedication, isValidObjectId } = require('../utils/validators');

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

// Helper — get time of day label for prompt context
const getTimeLabel = () => {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
};

// Helper — generate bilingual medication missed messages using Gemini
const generateMedAlertMessages = async (medicineName, scheduledTime, dosage) => {
  const timeLabel = getTimeLabel();

  const englishPrompt = `You are a caring assistant for elderly Indian users.
An elderly person missed their ${medicineName} (${dosage}) scheduled at ${scheduledTime} this ${timeLabel}.
Write a short, warm, caring alert message in English for their family member.
Keep it under 2 sentences. Be gentle and informative.`;

  const hindiPrompt = `आप एक बुजुर्ग भारतीय उपयोगकर्ताओं के लिए एक देखभाल करने वाले सहायक हैं।
एक बुजुर्ग व्यक्ति आज ${timeLabel === 'morning' ? 'सुबह' : timeLabel === 'afternoon' ? 'दोपहर' : 'शाम'} ${scheduledTime} बजे अपनी ${medicineName} (${dosage}) दवाई लेना भूल गए।
उनके परिवार के सदस्य के लिए हिंदी में एक छोटा, गर्मजोशी भरा संदेश लिखें।
2 वाक्यों से कम रखें। विनम्र और देखभाल करने वाले स्वर में लिखें।`;

  const [englishMessage, hindiMessage] = await Promise.all([
    callGemini(englishPrompt),
    callGemini(hindiPrompt),
  ]);

  return {
    message: englishMessage || `${medicineName} (${scheduledTime}) was not taken by the elder.`,
    messageHindi: hindiMessage || `${medicineName} की दवाई ${scheduledTime} बजे नहीं ली गई।`,
  };
};

// POST /api/medications/add — family only
const addMedication = async (req, res) => {
  try {
    const validation = validateMedication(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

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

          // Generate bilingual AI messages
          const { message, messageHindi } = await generateMedAlertMessages(
            med.medicineName,
            med.scheduledTime,
            med.dosage
          );

          await Alert.create({
            elderId,
            type: 'medication_missed',
            severity: 'medium',
            message,
            messageHindi,
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