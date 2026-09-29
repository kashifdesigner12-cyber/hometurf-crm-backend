const mongoose = require('mongoose');

const gmailConnectionSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    accessToken: {
      type: String,
      default: '',
      select: false,
    },

    refreshToken: {
      type: String,
      default: '',
      select: false,
    },

    tokenExpiry: {
      type: Date,
      default: null,
    },

    connected: {
      type: Boolean,
      default: true,
    },

    lastSyncAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const GmailConnection = mongoose.model(
  'GmailConnection',
  gmailConnectionSchema
);

module.exports = GmailConnection;