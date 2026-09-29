const express = require('express');

const router = express.Router();

const {
  registerAdmin,
  adminLogin,
  staffLogin,
  getMe,
  logout,
  changePassword,
} = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');

// Register Admin
router.post('/register', registerAdmin);

// Admin Login
router.post('/admin-login', adminLogin);

// Staff Login
router.post('/login', staffLogin);

// Get Current User
router.get('/me', protect, getMe);

// Logout
router.post('/logout', protect, logout);

// Change Password
router.put('/change-password', protect, changePassword);

module.exports = router;