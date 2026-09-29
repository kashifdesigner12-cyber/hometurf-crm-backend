const Review = require('../models/Review');
const Customer = require('../models/Customer');
const Service = require('../models/Service');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');
const automationService = require('../services/automationService');

// @desc    Create / record a review
// @route   POST /api/reviews
// @access  Private
const createReview = async (req, res, next) => {
  try {
    const {
      customer,
      service,
      rating,
      reviewText,
      source,
      reviewUrl,
      status,
    } = req.body;

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required',
      });
    }

    const customerDoc = await Customer.findById(customer);

    if (!customerDoc) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    let serviceDoc = null;

    if (service) {
      serviceDoc = await Service.findById(service);

      if (!serviceDoc) {
        return res.status(404).json({
          success: false,
          message: 'Service not found',
        });
      }
    }

    const review = await Review.create({
      customer,
      service: serviceDoc ? serviceDoc._id : null,
      rating: rating || null,
      reviewText: reviewText || '',
      source: source || 'GOOGLE',
      reviewUrl: reviewUrl || '',
      status: status || (rating ? 'RECEIVED' : 'REQUESTED'),
      requestedAt: status === 'REQUESTED' ? new Date() : null,
      receivedAt: rating ? new Date() : null,
    });

    if (rating) {
      await Notification.create({
        title: 'New Review Logged',
        message: `${rating}-star review recorded from ${customerDoc.name} on ${review.source}`,
        type: 'NEW_REVIEW',
        referenceId: review._id,
        referenceType: 'Review',
      });
    }

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customerDoc._id,
      action: rating ? 'REVIEW_RECEIVED' : 'REVIEW_REQUESTED',
      description: `${
        rating
          ? `Logged ${rating}-star review`
          : 'Created review request'
      } for ${customerDoc.name}`,
    });

    const populated = await Review.findById(review._id)
      .populate('customer', 'name phone email')
      .populate('service', 'serviceName');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reviews
// @route   GET /api/reviews
// @access  Private
const getReviews = async (req, res, next) => {
  try {
    const { source, status, rating, customer } = req.query;

    const query = {};

    if (source) query.source = source;
    if (status) query.status = status;
    if (rating) query.rating = Number(rating);
    if (customer) query.customer = customer;

    const reviews = await Review.find(query)
      .populate('customer', 'name phone email')
      .populate('service', 'serviceName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single review
// @route   GET /api/reviews/:id
// @access  Private
const getReviewById = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('customer')
      .populate('service');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update review
// @route   PUT /api/reviews/:id
// @access  Private
const updateReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    if (req.body.customer) {
      const customerDoc = await Customer.findById(req.body.customer);

      if (!customerDoc) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
      }
    }

    if (req.body.service) {
      const serviceDoc = await Service.findById(req.body.service);

      if (!serviceDoc) {
        return res.status(404).json({
          success: false,
          message: 'Service not found',
        });
      }
    }

    const updated = await Review.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('customer', 'name phone email')
      .populate('service', 'serviceName');

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update review status
// @route   PATCH /api/reviews/:id/status
// @access  Private
const updateReviewStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide review status',
      });
    }

    const review = await Review.findById(req.params.id)
      .populate('customer');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    review.status = status;

    if (status === 'RECEIVED' && !review.receivedAt) {
      review.receivedAt = new Date();
    }

    await review.save();

    if (status === 'FOLLOW_UP' && review.customer) {
      await automationService.onReviewFollowup(
        review,
        review.customer
      );
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private
const deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('customer', 'name phone email');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    const customerId = review.customer
      ? review.customer._id
      : null;

    const customerName = review.customer
      ? review.customer.name
      : 'Unknown Customer';

    await Review.findByIdAndDelete(req.params.id);

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customerId,
      action: 'REVIEW_DELETED',
      description: `Deleted review for ${customerName}`,
    });

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReview,
  getReviews,
  getReviewById,
  updateReview,
  updateReviewStatus,
  deleteReview,
};