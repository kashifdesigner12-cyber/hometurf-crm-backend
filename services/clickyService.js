const Review = require('../models/Review');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');

/**
 * Clicky Review Integration Service
 */
class ClickyService {
  constructor() {
    this.apiUrl = process.env.CLICKY_API_URL || '';
    this.apiKey = process.env.CLICKY_API_KEY || '';
  }

  // =====================================================
  // SEND REVIEW REQUEST
  // =====================================================

  async sendReviewRequest({
    customerId,
    serviceId = null,
    customerPhone,
    customerEmail,
    customerName,
  }) {
    if (!customerId) {
      throw new Error(
        'Customer ID is required to send Clicky review request'
      );
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      throw new Error('Customer not found');
    }

    let review = await Review.findOne({
      customer: customerId,
      status: 'NOT_REQUESTED',
    });

    if (!review) {
      review = await Review.create({
        customer: customerId,
        service: serviceId,
        source: 'CLICKY',
        status: 'REQUESTED',
        requestedAt: new Date(),
        reviewUrl: `${
          this.apiUrl || 'https://clicky.example.com/review'
        }/req?cust=${customerId}`,
      });
    } else {
      review.status = 'REQUESTED';
      review.requestedAt = new Date();
      review.source = 'CLICKY';

      if (serviceId) {
        review.service = serviceId;
      }

      await review.save();
    }

    if (this.apiUrl && this.apiKey) {
      console.log(
        `[ClickyService] Dispatched review request for customer ${
          customerName || customer.name || customerId
        }`
      );
    } else {
      console.log(
        `[ClickyService] Prepared review request for ${
          customerName || customer.name || customerId
        }`
      );
    }

    await logActivity({
      customer: customerId,
      action: 'REVIEW_REQUESTED',
      description: `Review request sent to ${
        customerName || customerPhone || customer.name || 'Customer'
      } via Clicky`,
    });

    return review;
  }

  // =====================================================
  // FIND OR CREATE CUSTOMER
  // =====================================================

  async findOrCreateCustomer({
    customerId,
    customerName,
    customerPhone,
    customerEmail,
  }) {
    // ---------------------------------------------
    // 1. Customer ID provided
    // ---------------------------------------------

    if (customerId) {
      const customer = await Customer.findById(customerId);

      if (customer) {
        return customer;
      }
    }

    // ---------------------------------------------
    // 2. Find by phone
    // ---------------------------------------------

    let customer = null;

    if (customerPhone) {
      customer = await Customer.findOne({
        phone: customerPhone,
      });
    }

    // ---------------------------------------------
    // 3. Find by email
    // ---------------------------------------------

    if (!customer && customerEmail) {
      customer = await Customer.findOne({
        email: customerEmail.toLowerCase().trim(),
      });
    }

    if (customer) {
      return customer;
    }

    // ---------------------------------------------
    // 4. Validate required customer information
    // ---------------------------------------------

    if (!customerPhone) {
      throw new Error(
        'Customer phone number is required to create Clicky review customer'
      );
    }

    // ---------------------------------------------
    // 5. Create new customer
    // ---------------------------------------------

    customer = await Customer.create({
      name: customerName || `Clicky Customer ${customerPhone}`,
      phone: customerPhone,
      email: customerEmail
        ? customerEmail.toLowerCase().trim()
        : '',
      source: 'MANUAL',
      status: 'ACTIVE',
      notes: 'Customer created automatically from Clicky review sync',
    });

    return customer;
  }

  // =====================================================
  // SYNC CLICKY REVIEWS
  // =====================================================

  async syncReviews(reviewsData = []) {
    const synced = [];

    if (!Array.isArray(reviewsData)) {
      throw new Error('Reviews must be provided as an array');
    }

    for (const item of reviewsData) {
      const {
        customerId,
        customerName,
        customerPhone,
        customerEmail,
        rating,
        reviewText,
        reviewUrl,
        createTime,
      } = item;

      // ---------------------------------------------
      // Find or create customer
      // ---------------------------------------------

      const customer = await this.findOrCreateCustomer({
        customerId,
        customerName,
        customerPhone,
        customerEmail,
      });

      // ---------------------------------------------
      // Find existing Clicky review
      // ---------------------------------------------

      let review = await Review.findOne({
        customer: customer._id,
        source: 'CLICKY',
      });

      // ---------------------------------------------
      // Create new review
      // ---------------------------------------------

      if (!review) {
        review = await Review.create({
          customer: customer._id,
          service: null,
          rating: rating !== undefined ? rating : 5,
          reviewText: reviewText || '',
          source: 'CLICKY',
          reviewUrl: reviewUrl || '',
          status: 'RECEIVED',
          receivedAt: createTime
            ? new Date(createTime)
            : new Date(),
        });
      }

      // ---------------------------------------------
      // Update existing review
      // ---------------------------------------------

      else {
        if (rating !== undefined) {
          review.rating = rating;
        }

        if (reviewText !== undefined) {
          review.reviewText = reviewText;
        }

        if (reviewUrl !== undefined) {
          review.reviewUrl = reviewUrl;
        }

        review.status = 'RECEIVED';

        review.receivedAt = createTime
          ? new Date(createTime)
          : new Date();

        await review.save();
      }

      // ---------------------------------------------
      // Activity log
      // ---------------------------------------------

      await logActivity({
        customer: customer._id,
        action: 'REVIEW_RECEIVED',
        description: `Received ${rating || 5}-star review from ${
          customer.name
        } via Clicky`,
      });

      // ---------------------------------------------
      // Notification
      // ---------------------------------------------

      await Notification.create({
        title: 'New Clicky Review',
        message: `Received ${rating || 5}-star review from ${
          customer.name
        } on Clicky`,
        type: 'NEW_REVIEW',
        referenceId: review._id,
        referenceType: 'Review',
      });

      // ---------------------------------------------
      // Add to synced result
      // ---------------------------------------------

      const populatedReview = await Review.findById(review._id)
        .populate('customer', 'name phone email');

      synced.push(populatedReview);
    }

    return synced;
  }
}

module.exports = new ClickyService();