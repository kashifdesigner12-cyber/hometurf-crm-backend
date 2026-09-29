const Review = require('../models/Review');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');

/**
 * Google Business Profile Service
 */
class GoogleBusinessService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  }

  // =====================================================
  // FIND OR CREATE CUSTOMER
  // =====================================================

  async findOrCreateCustomer({
    reviewerName,
    reviewerPhone,
    reviewerEmail,
  }) {
    let customer = null;

    const phone = reviewerPhone
      ? String(reviewerPhone).trim()
      : '';

    const email = reviewerEmail
      ? String(reviewerEmail).trim().toLowerCase()
      : '';

    const name = reviewerName
      ? String(reviewerName).trim()
      : 'Google Reviewer';

    // -------------------------------------------------
    // Find by phone
    // -------------------------------------------------

    if (phone && phone !== 'N/A') {
      customer = await Customer.findOne({
        phone,
      });
    }

    // -------------------------------------------------
    // Find by email
    // -------------------------------------------------

    if (!customer && email) {
      customer = await Customer.findOne({
        email,
      });
    }

    // -------------------------------------------------
    // Find by name as fallback
    // -------------------------------------------------

    if (!customer && name) {
      customer = await Customer.findOne({
        name,
        source: 'GOOGLE',
      });
    }

    // -------------------------------------------------
    // Return existing customer
    // -------------------------------------------------

    if (customer) {
      return customer;
    }

    // -------------------------------------------------
    // Create new customer
    // -------------------------------------------------

    customer = await Customer.create({
      name,
      phone: phone || 'N/A',
      email,
      source: 'GOOGLE',
      status: 'ACTIVE',
      notes: 'Auto-created from Google Business Profile review',
    });

    return customer;
  }

  // =====================================================
  // SYNC REVIEWS
  // =====================================================

  async syncReviews(reviewsData = []) {
    const syncedReviews = [];

    if (!Array.isArray(reviewsData)) {
      throw new Error('Reviews must be provided as an array');
    }

    for (const item of reviewsData) {
      // -------------------------------------------------
      // Support both Google-style and test/manual payloads
      // -------------------------------------------------

      const reviewerName =
        item.reviewerName ||
        item.customerName ||
        'Google Reviewer';

      const reviewerPhone =
        item.reviewerPhone ||
        item.customerPhone ||
        '';

      const reviewerEmail =
        item.reviewerEmail ||
        item.customerEmail ||
        '';

      const rating =
        item.rating !== undefined && item.rating !== null
          ? Number(item.rating)
          : 5;

      const reviewText =
        item.reviewText || '';

      const reviewUrl =
        item.reviewUrl || '';

      const createTime =
        item.createTime || null;

      // -------------------------------------------------
      // Find or create customer
      // -------------------------------------------------

      const customer = await this.findOrCreateCustomer({
        reviewerName,
        reviewerPhone,
        reviewerEmail,
      });

      // -------------------------------------------------
      // FIRST: Find review by review URL
      // -------------------------------------------------

      let review = null;

      if (reviewUrl) {
        review = await Review.findOne({
          source: 'GOOGLE',
          reviewUrl,
        });
      }

      // -------------------------------------------------
      // SECOND: Find existing Google review by customer
      // -------------------------------------------------

      if (!review) {
        review = await Review.findOne({
          customer: customer._id,
          source: 'GOOGLE',
        });
      }

      // -------------------------------------------------
      // CREATE NEW REVIEW
      // -------------------------------------------------

      if (!review) {
        review = await Review.create({
          customer: customer._id,
          service: null,
          rating,
          reviewText,
          source: 'GOOGLE',
          reviewUrl,
          status: 'RECEIVED',
          receivedAt: createTime
            ? new Date(createTime)
            : new Date(),
        });

        // -----------------------------------------------
        // Notification only for new review
        // -----------------------------------------------

        await Notification.create({
          title: 'New Google Review',
          message: `Received a ${rating}-star review from ${customer.name} on Google`,
          type: 'NEW_REVIEW',
          referenceId: review._id,
          referenceType: 'Review',
        });

        // -----------------------------------------------
        // Activity log
        // -----------------------------------------------

        await logActivity({
          customer: customer._id,
          action: 'REVIEW_RECEIVED',
          description: `Google Business review (${rating} stars) by ${customer.name}`,
        });
      }

      // -------------------------------------------------
      // UPDATE EXISTING REVIEW
      // -------------------------------------------------

      else {
        review.customer = customer._id;
        review.rating = rating;
        review.reviewText = reviewText;
        review.status = 'RECEIVED';
        review.receivedAt = createTime
          ? new Date(createTime)
          : new Date();

        if (reviewUrl) {
          review.reviewUrl = reviewUrl;
        }

        await review.save();
      }

      // -------------------------------------------------
      // Populate customer
      // -------------------------------------------------

      const populatedReview = await Review.findById(review._id)
        .populate('customer', 'name phone email');

      syncedReviews.push(populatedReview);
    }

    return syncedReviews;
  }
}

module.exports = new GoogleBusinessService();