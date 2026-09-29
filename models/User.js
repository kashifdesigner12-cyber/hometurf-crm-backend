const mongoose = require('mongoose');

const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email',
      ],
    },

    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: '',
    },

    role: {
      type: String,
      enum: ['ADMIN', 'STAFF'],
      default: 'STAFF',
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },

    /*
    |--------------------------------------------------------------------------
    | Google Gmail OAuth
    |--------------------------------------------------------------------------
    | Used for connecting the HomeTurf Gmail account with the CRM.
    |
    */

    googleAccessToken: {
      type: String,
      default: '',
      select: false,
    },

    googleRefreshToken: {
      type: String,
      default: '',
      select: false,
    },

    googleTokenExpiry: {
      type: Date,
      default: null,
      select: false,
    },

    googleEmail: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },

    googleConnected: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(
    this.password,
    10
  );
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (
  enteredPassword
) {
  if (!this.password) {
    return false;
  }

  return bcrypt.compare(
    enteredPassword,
    this.password
  );
};

module.exports =
  mongoose.model('User', userSchema);