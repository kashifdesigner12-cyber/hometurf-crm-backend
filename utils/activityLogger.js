const ActivityLog = require('../models/ActivityLog');

const logActivity = async ({ user = null, customer = null, lead = null, action, description }) => {
  try {
    await ActivityLog.create({
      user,
      customer,
      lead,
      action,
      description,
    });
  } catch (error) {
    console.error('Activity Logging Error:', error.message);
  }
};

module.exports = logActivity;