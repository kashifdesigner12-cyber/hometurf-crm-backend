const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'hometurf_crm_super_secret_jwt_key_2026';

// =====================================================
// PROTECT ROUTES
// =====================================================

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    // Check Authorization header
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message:
          'Not authorized to access this route, token missing',
      });
    }

    // Check Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message:
          'Not authorized, invalid authorization format',
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message:
          'Not authorized to access this route, token missing',
      });
    }

    // Verify JWT
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message:
          'Not authorized, invalid token payload',
      });
    }

    // Find user
    const user = await User.findById(
      decoded.id
    ).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
      });
    }

    // Normalize status
    const userStatus = String(
      user.status || ''
    )
      .trim()
      .toUpperCase();

    // Block inactive users
    if (userStatus === 'INACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'User account is inactive',
      });
    }

    // Attach authenticated user
    req.user = user;

    next();
  } catch (error) {
    // JWT errors
    if (
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Not authorized, token has expired',
      });
    }

    if (
      error.name === 'JsonWebTokenError'
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Not authorized, invalid token',
      });
    }

    // Other authentication errors
    return res.status(401).json({
      success: false,
      message:
        'Not authorized, authentication failed',
    });
  }
};

module.exports = {
  protect,
};