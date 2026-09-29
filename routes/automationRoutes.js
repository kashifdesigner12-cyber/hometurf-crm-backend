const express = require('express');

const router = express.Router();
const templateRouter = express.Router();

const {
  createAutomation,
  getAutomations,
  getAutomationById,
  updateAutomation,
  deleteAutomation,

  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} = require('../controllers/automationController');

const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// =====================================================
// AUTOMATION ROUTES
// =====================================================

// GET ALL AUTOMATIONS
// GET /api/automations
router.get(
  '/',
  protect,
  getAutomations
);

// CREATE AUTOMATION - ADMIN ONLY
// POST /api/automations
router.post(
  '/',
  protect,
  authorize('ADMIN'),
  createAutomation
);

// GET AUTOMATION BY ID
// GET /api/automations/:id
router.get(
  '/:id',
  protect,
  getAutomationById
);

// UPDATE AUTOMATION - ADMIN ONLY
// PUT /api/automations/:id
router.put(
  '/:id',
  protect,
  authorize('ADMIN'),
  updateAutomation
);

// PATCH AUTOMATION - ADMIN ONLY
// PATCH /api/automations/:id
router.patch(
  '/:id',
  protect,
  authorize('ADMIN'),
  updateAutomation
);

// DELETE AUTOMATION - ADMIN ONLY
// DELETE /api/automations/:id
router.delete(
  '/:id',
  protect,
  authorize('ADMIN'),
  deleteAutomation
);

// =====================================================
// MESSAGE TEMPLATE ROUTES
// =====================================================

// GET ALL TEMPLATES
// GET /api/message-templates
templateRouter.get(
  '/',
  protect,
  getTemplates
);

// CREATE TEMPLATE - ADMIN ONLY
// POST /api/message-templates
templateRouter.post(
  '/',
  protect,
  authorize('ADMIN'),
  createTemplate
);

// GET TEMPLATE BY ID
// GET /api/message-templates/:id
templateRouter.get(
  '/:id',
  protect,
  getTemplateById
);

// UPDATE TEMPLATE - ADMIN ONLY
// PUT /api/message-templates/:id
templateRouter.put(
  '/:id',
  protect,
  authorize('ADMIN'),
  updateTemplate
);

// PATCH TEMPLATE - ADMIN ONLY
// PATCH /api/message-templates/:id
templateRouter.patch(
  '/:id',
  protect,
  authorize('ADMIN'),
  updateTemplate
);

// DELETE TEMPLATE - ADMIN ONLY
// DELETE /api/message-templates/:id
templateRouter.delete(
  '/:id',
  protect,
  authorize('ADMIN'),
  deleteTemplate
);

// =====================================================
// EXPORT ROUTES
// =====================================================

module.exports = {
  automationRoutes: router,
  templateRoutes: templateRouter,
};