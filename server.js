const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables
dotenv.config();

// Connect to MongoDB Database
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

// Initialize Express App
const app = express();

/* =========================================================
   CORS CONFIGURATION
========================================================= */

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an origin
      // Example: Postman, server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      // Allow configured frontend origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Reject unknown origins
      return callback(
        new Error(`CORS policy: Origin ${origin} is not allowed`)
      );
    },

    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
  })
);

/* =========================================================
   RESEND WEBHOOK
   Keep raw request body available for webhook verification.
========================================================= */

app.use(
  '/api/emails/webhook',
  express.raw({
    type: 'application/json',
  })
);

/* =========================================================
   BODY PARSERS
========================================================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   ROOT ROUTE
========================================================= */

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HomeTurf CRM API is running',
  });
});

/* =========================================================
   HEALTH CHECK ROUTE
========================================================= */

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HomeTurf CRM API is running',
  });
});

/* =========================================================
   IMPORT API ROUTES
========================================================= */

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const leadRoutes = require('./routes/leadRoutes');
const customerRoutes = require('./routes/customerRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const callRoutes = require('./routes/callRoutes');
const reviewRoutes = require('./routes/reviewRoutes');

const {
  automationRoutes,
  templateRoutes,
} = require('./routes/automationRoutes');

const notificationRoutes = require('./routes/notificationRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const emailRoutes = require('./routes/emailRoutes');

/* =========================================================
   MOUNT API ROUTES
========================================================= */

app.use('/api/auth', authRoutes);

app.use('/api/users', userRoutes);

app.use('/api/leads', leadRoutes);

app.use('/api/customers', customerRoutes);

app.use('/api/appointments', appointmentRoutes);

app.use('/api/services', serviceRoutes);

app.use('/api/conversations', conversationRoutes);

app.use('/api/messages', messageRoutes);

app.use('/api/message-templates', templateRoutes);

app.use('/api/calls', callRoutes);

app.use('/api/reviews', reviewRoutes);

app.use('/api/automations', automationRoutes);

app.use('/api/notifications', notificationRoutes);

app.use('/api/integrations', integrationRoutes);

app.use('/api/dashboard', dashboardRoutes);

/* =========================================================
   EMAIL ROUTES
========================================================= */

app.use('/api/emails', emailRoutes);

/* =========================================================
   404 / ERROR HANDLING
========================================================= */

app.use(notFound);

app.use(errorHandler);

/* =========================================================
   START SERVER
========================================================= */

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(
      `HomeTurf CRM Server running in ${
        process.env.NODE_ENV || 'development'
      } mode on port ${PORT}`
    );

    console.log(`Server Port: ${PORT}`);

    if (process.env.FRONTEND_URL) {
      console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
    }
  });
}

/* =========================================================
   EXPORT APP
========================================================= */

module.exports = app;