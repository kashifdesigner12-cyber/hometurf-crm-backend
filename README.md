# HomeTurf CRM — Complete Backend API

A clean, modular, and production-ready CRM backend built with **Node.js**, **Express.js**, **MongoDB**, and **Mongoose**.

---

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control (`ADMIN` and `STAFF`) and bcryptjs password encryption.
- **Lead Management**: Full lifecycle tracking (`NEW`, `CONTACTED`, `BOOKED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), staff assignment, and one-click lead-to-customer conversion.
- **Customer Profiles**: Deep relationship linking showing appointments, services, conversations, calls, reviews, and activity logs.
- **Appointments & Booking**: Scheduling, status updates, and automated booking confirmation alerts.
- **Services / Jobs**: Job lifecycle management with auto-triggered completion timestamps, thank-you messages, and review request workflows.
- **Unified Conversations & Messaging**: Omnichannel messaging for Facebook, Instagram, WhatsApp, SMS, and Email.
- **AI Incoming Calls**: Inbound AI call webhook processing with automated caller lookup, lead creation, audio recording URLs, transcripts, summaries, and outcomes.
- **Integrations**: Meta (Facebook & Instagram), Google Business Profile, WhatsApp Graph API, SMS providers, AI Voice, and Clicky review requests.
- **Automations & Templates**: Configurable trigger-based workflows with dynamic placeholder rendering (`{{customerName}}`, `{{serviceName}}`, etc.).
- **Notifications & Audit History**: Real-time notification badges and complete activity audit trail.
- **Dashboard Metrics**: Aggregated KPI stats (Customers, Leads by Source, Appointments, Completed Jobs, Calls, Reviews).

---

## Project Structure

```text
hometurf-crm-backend/
├── config/
│   └── db.js
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── leadController.js
│   ├── customerController.js
│   ├── appointmentController.js
│   ├── serviceController.js
│   ├── conversationController.js
│   ├── messageController.js
│   ├── callController.js
│   ├── reviewController.js
│   ├── automationController.js
│   ├── notificationController.js
│   ├── integrationController.js
│   └── dashboardController.js
├── models/
│   ├── User.js
│   ├── Lead.js
│   ├── Customer.js
│   ├── Appointment.js
│   ├── Service.js
│   ├── Conversation.js
│   ├── Message.js
│   ├── Call.js
│   ├── Review.js
│   ├── Automation.js
│   ├── MessageTemplate.js
│   ├── Notification.js
│   ├── Integration.js
│   └── ActivityLog.js
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── leadRoutes.js
│   ├── customerRoutes.js
│   ├── appointmentRoutes.js
│   ├── serviceRoutes.js
│   ├── conversationRoutes.js
│   ├── messageRoutes.js
│   ├── callRoutes.js
│   ├── reviewRoutes.js
│   ├── automationRoutes.js
│   ├── notificationRoutes.js
│   ├── integrationRoutes.js
│   └── dashboardRoutes.js
├── middleware/
│   ├── authMiddleware.js
│   ├── roleMiddleware.js
│   └── errorMiddleware.js
├── services/
│   ├── facebookService.js
│   ├── instagramService.js
│   ├── googleBusinessService.js
│   ├── whatsappService.js
│   ├── smsService.js
│   ├── aiCallService.js
│   ├── clickyService.js
│   └── automationService.js
├── utils/
│   ├── generateToken.js
│   └── activityLogger.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md