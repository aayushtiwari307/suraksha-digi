const mongoose = require('mongoose');

const elderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  age: {
    type: Number,
    required: true
  },
  language: {
    type: String,
    enum: ['hindi', 'english'],
    default: 'hindi'
  },
  password: {
    type: String,
    required: true
  },
  safetyScore: {
    type: Number,
    default: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  familyMembers: [
    {
      name: { type: String },
      phone: { type: String },
      relation: { type: String }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Elder', elderSchema);