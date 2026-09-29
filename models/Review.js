const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Review must be linked to a customer'],
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    reviewText: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      enum: ['GOOGLE', 'CLICKY'],
      default: 'GOOGLE',
    },
    reviewUrl: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'FOLLOW_UP'],
      default: 'NOT_REQUESTED',
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Review', reviewSchema);