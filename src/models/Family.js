const mongoose = require('mongoose');

const familySchema = new mongoose.Schema({
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
  password: {
    type: String,
    required: true
  },
  elders: [
    {
      elderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Elder'
      },
      relation: {
        type: String,
        required: true
      },
      canViewAlerts: {
        type: Boolean,
        default: true
      }
    }
  ],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Family', familySchema);