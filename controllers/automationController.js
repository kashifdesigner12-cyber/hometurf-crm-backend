const Automation = require('../models/Automation');
const MessageTemplate = require('../models/MessageTemplate');

// =====================================================
// ADMIN PERMISSION CHECK
// =====================================================

const requireAdmin = (req, res) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Not authorized, user authentication required',
    });

    return false;
  }

  const role = String(req.user.role || '')
    .trim()
    .toUpperCase();

  if (role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: `User role '${role || 'UNKNOWN'}' is not authorized to access this route`,
    });

    return false;
  }

  return true;
};

// =====================================================
// MESSAGE TEMPLATES
// =====================================================

// CREATE TEMPLATE
const createTemplate = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const {
      name,
      type,
      subject,
      content,
      active,
    } = req.body;

    if (!name || !type || !content) {
      return res.status(400).json({
        success: false,
        message:
          'Name, type, and content are required for message template',
      });
    }

    const template = await MessageTemplate.create({
      name: String(name).trim(),
      type: String(type).trim().toUpperCase(),
      subject: subject
        ? String(subject).trim()
        : '',
      content: String(content).trim(),
      active:
        active !== undefined
          ? Boolean(active)
          : true,
    });

    return res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL TEMPLATES
const getTemplates = async (req, res, next) => {
  try {
    const {
      type,
      active,
    } = req.query;

    const query = {};

    if (type) {
      query.type = String(type)
        .trim()
        .toUpperCase();
    }

    if (active !== undefined) {
      query.active = active === 'true';
    }

    const templates = await MessageTemplate.find(query)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
};

// GET TEMPLATE BY ID
const getTemplateById = async (req, res, next) => {
  try {
    const template = await MessageTemplate.findById(
      req.params.id
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE TEMPLATE
const updateTemplate = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const template = await MessageTemplate.findById(
      req.params.id
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }

    const allowedFields = [
      'name',
      'type',
      'subject',
      'content',
      'active',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'type') {
          template[field] = String(req.body[field])
            .trim()
            .toUpperCase();
        } else if (
          field === 'name' ||
          field === 'subject' ||
          field === 'content'
        ) {
          template[field] = String(req.body[field]).trim();
        } else {
          template[field] = Boolean(req.body[field]);
        }
      }
    }

    if (!template.name) {
      return res.status(400).json({
        success: false,
        message: 'Template name cannot be empty',
      });
    }

    if (!template.type) {
      return res.status(400).json({
        success: false,
        message: 'Template type cannot be empty',
      });
    }

    if (!template.content) {
      return res.status(400).json({
        success: false,
        message: 'Template content cannot be empty',
      });
    }

    await template.save();

    return res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE TEMPLATE
const deleteTemplate = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const template = await MessageTemplate.findById(
      req.params.id
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }

    await MessageTemplate.findByIdAndDelete(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// AUTOMATIONS
// =====================================================

// CREATE AUTOMATION
const createAutomation = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const {
      name,
      trigger,
      action,
      delay,
      active,
      messageTemplate,
    } = req.body;

    if (!name || !trigger) {
      return res.status(400).json({
        success: false,
        message:
          'Automation name and trigger are required',
      });
    }

    let templateId = null;

    if (messageTemplate) {
      const template = await MessageTemplate.findById(
        messageTemplate
      );

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Message template not found',
        });
      }

      templateId = template._id;
    }

    const automation = new Automation({
      name: String(name).trim(),

      trigger: String(trigger)
        .trim()
        .toUpperCase(),

      action: action
        ? String(action)
            .trim()
            .toUpperCase()
        : 'SEND_MESSAGE',

      delay:
        delay !== undefined
          ? Number(delay)
          : 0,

      active:
        active !== undefined
          ? Boolean(active)
          : true,

      messageTemplate: templateId,
    });

    await automation.save();

    const populated = await Automation.findById(
      automation._id
    ).populate('messageTemplate');

    return res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL AUTOMATIONS
const getAutomations = async (req, res, next) => {
  try {
    const {
      trigger,
      active,
    } = req.query;

    const query = {};

    if (trigger) {
      query.trigger = String(trigger)
        .trim()
        .toUpperCase();
    }

    if (active !== undefined) {
      query.active = active === 'true';
    }

    const automations = await Automation.find(query)
      .populate('messageTemplate')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: automations.length,
      data: automations,
    });
  } catch (error) {
    next(error);
  }
};

// GET AUTOMATION BY ID
const getAutomationById = async (req, res, next) => {
  try {
    const automation = await Automation.findById(
      req.params.id
    ).populate('messageTemplate');

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: automation,
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE AUTOMATION
const updateAutomation = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const automation = await Automation.findById(
      req.params.id
    );

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    // ---------------------------------------------
    // MESSAGE TEMPLATE
    // ---------------------------------------------

    if (
      req.body.messageTemplate !== undefined
    ) {
      const templateId =
        req.body.messageTemplate;

      if (
        templateId === null ||
        templateId === ''
      ) {
        automation.messageTemplate = null;
      } else {
        const template =
          await MessageTemplate.findById(
            templateId
          );

        if (!template) {
          return res.status(404).json({
            success: false,
            message: 'Message template not found',
          });
        }

        automation.messageTemplate =
          template._id;
      }
    }

    // ---------------------------------------------
    // NAME
    // ---------------------------------------------

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Automation name cannot be empty',
        });
      }

      automation.name = name;
    }

    // ---------------------------------------------
    // TRIGGER
    // ---------------------------------------------

    if (req.body.trigger !== undefined) {
      automation.trigger = String(
        req.body.trigger
      )
        .trim()
        .toUpperCase();
    }

    // ---------------------------------------------
    // ACTION
    // ---------------------------------------------

    if (req.body.action !== undefined) {
      automation.action = String(
        req.body.action
      )
        .trim()
        .toUpperCase();
    }

    // ---------------------------------------------
    // DELAY
    // ---------------------------------------------

    if (req.body.delay !== undefined) {
      const delay = Number(req.body.delay);

      if (Number.isNaN(delay) || delay < 0) {
        return res.status(400).json({
          success: false,
          message:
            'Automation delay must be a valid non-negative number',
        });
      }

      automation.delay = delay;
    }

    // ---------------------------------------------
    // ACTIVE
    // ---------------------------------------------

    if (req.body.active !== undefined) {
      automation.active =
        Boolean(req.body.active);
    }

    // ---------------------------------------------
    // SAVE
    // ---------------------------------------------

    await automation.save();

    // ---------------------------------------------
    // POPULATE TEMPLATE
    // ---------------------------------------------

    const updated =
      await Automation.findById(
        automation._id
      ).populate('messageTemplate');

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE AUTOMATION
const deleteAutomation = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const automation = await Automation.findById(
      req.params.id
    );

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found',
      });
    }

    await Automation.findByIdAndDelete(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message:
        'Automation rule deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
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
};