const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide lead name'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Please provide lead phone number'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    source: {
      type: String,
      enum: ['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'PHONE', 'MANUAL'],
      default: 'MANUAL',
    },
    service: {
      type: String,
      trim: true,
      default: '',
    },
    message: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'NEW',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Lead', leadSchema);