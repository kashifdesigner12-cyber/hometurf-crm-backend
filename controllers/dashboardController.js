const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const Appointment = require('../models/Appointment');
const Call = require('../models/Call');
const Review = require('../models/Review');

// @desc    Get dashboard metrics and statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalCustomers,
      totalLeads,
      newLeads,
      totalAppointments,
      completedServices,
      totalCalls,
      aiCalls,
      reviewsReceived,
      pendingReviews,
      leadsBySourceData,
    ] = await Promise.all([
      Customer.countDocuments(),

      Lead.countDocuments(),

      Lead.countDocuments({
        status: 'NEW',
      }),

      Appointment.countDocuments(),

      // Completed services are tracked through completed appointments
      Appointment.countDocuments({
        status: 'COMPLETED',
      }),

      Call.countDocuments(),

      Call.countDocuments({
        direction: 'INCOMING',
      }),

      Review.countDocuments({
        status: 'RECEIVED',
      }),

      Review.countDocuments({
        status: {
          $in: ['NOT_REQUESTED', 'REQUESTED', 'FOLLOW_UP'],
        },
      }),

      Lead.aggregate([
        {
          $group: {
            _id: '$source',
            count: {
              $sum: 1,
            },
          },
        },
      ]),
    ]);

    const leadsBySource = {
      FACEBOOK: 0,
      INSTAGRAM: 0,
      GOOGLE: 0,
      PHONE: 0,
      MANUAL: 0,
    };

    leadsBySourceData.forEach((item) => {
      if (item._id && leadsBySource[item._id] !== undefined) {
        leadsBySource[item._id] = item.count;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        totalLeads,
        newLeads,
        totalAppointments,
        completedServices,
        totalCalls,
        aiCalls,
        reviewsReceived,
        pendingReviews,
        leadsBySource,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
};