const User = require('../models/User');
const logActivity = require('../utils/activityLogger');

// @desc    Get all users (Staff / Admin)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
  try {
    const { role, status, search } = req.query;

    const query = {};

    if (role) {
      query.role = role.toUpperCase();
    }

    if (status) {
      query.status = status.toUpperCase();
    }

    if (search && search.trim()) {
      const searchText = search.trim();

      query.$or = [
        { name: { $regex: searchText, $options: 'i' } },
        { email: { $regex: searchText, $options: 'i' } },
        { phone: { $regex: searchText, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a user / staff member
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      role,
      status,
    } = req.body;

    // Required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate role
    const userRole = role ? role.toUpperCase() : 'STAFF';

    if (!['ADMIN', 'STAFF'].includes(userRole)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be ADMIN or STAFF',
      });
    }

    // Validate status
    const userStatus = status ? status.toUpperCase() : 'ACTIVE';

    if (!['ACTIVE', 'INACTIVE'].includes(userStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be ACTIVE or INACTIVE',
      });
    }

    // Check duplicate email
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    // IMPORTANT:
    // Do NOT bcrypt.hash() here.
    // User model pre-save middleware will hash the password once.
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: phone ? phone.trim() : '',
      role: userRole,
      status: userStatus,
    });

    await logActivity({
      user: req.user._id,
      action: 'USER_CREATED',
      description: `Created new user account: ${user.name} (${user.role})`,
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      role,
      status,
      password,
    } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update name
    if (name !== undefined) {
      user.name = name.trim();
    }

    // Update email
    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();

      const emailExists = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'A user with this email already exists',
        });
      }

      user.email = normalizedEmail;
    }

    // Update phone
    if (phone !== undefined) {
      user.phone = phone.trim();
    }

    // Update role
    if (role !== undefined) {
      const newRole = role.toUpperCase();

      if (!['ADMIN', 'STAFF'].includes(newRole)) {
        return res.status(400).json({
          success: false,
          message: 'Role must be ADMIN or STAFF',
        });
      }

      user.role = newRole;
    }

    // Update status
    if (status !== undefined) {
      const newStatus = status.toUpperCase();

      if (!['ACTIVE', 'INACTIVE'].includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be ACTIVE or INACTIVE',
        });
      }

      user.status = newStatus;
    }

    // Update password
    // Do NOT hash manually.
    // User model pre-save hook will hash it once.
    if (password !== undefined && password.trim()) {
      user.password = password;
    }

    await user.save();

    await logActivity({
      user: req.user._id,
      action: 'USER_UPDATED',
      description: `Updated user: ${user.name}`,
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent deleting own account
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    await User.findByIdAndDelete(req.params.id);

    await logActivity({
      user: req.user._id,
      action: 'USER_DELETED',
      description: `Deleted user: ${user.name}`,
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};