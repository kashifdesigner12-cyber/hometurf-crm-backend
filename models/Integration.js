const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: [
        'FACEBOOK',
        'INSTAGRAM',
        'GOOGLE_BUSINESS',
        'WHATSAPP',
        'SMS',
        'AI_CALL',
        'CLICKY',
      ],
      required: [true, 'Please provide integration provider'],
      unique: true,
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'PENDING'],
      default: 'INACTIVE',
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Integration', integrationSchema);