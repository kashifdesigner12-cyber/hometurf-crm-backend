const Automation = require('../models/Automation');
const Notification = require('../models/Notification');

const whatsappService = require('./whatsappService');
const smsService = require('./smsService');
const clickyService = require('./clickyService');

class AutomationService {
  // =====================================================
  // REPLACE PLACEHOLDERS
  // =====================================================

  replacePlaceholders(content, context = {}) {
    if (!content) {
      return '';
    }

    return content.replace(
      /\{\{(\w+)\}\}/g,
      (match, key) => {
        if (
          context[key] !== undefined &&
          context[key] !== null
        ) {
          return String(context[key]);
        }

        return match;
      }
    );
  }

  // =====================================================
  // CENTRAL AUTOMATION ENGINE
  // =====================================================

  async handleTrigger(
    triggerType,
    contextData = {},
    actionFilter = null
  ) {
    try {
      console.log(
        `[Automation] Trigger started: ${triggerType}${
          actionFilter
            ? ` | Action: ${actionFilter}`
            : ''
        }`
      );

      const query = {
        trigger: triggerType,
        active: true,
      };

      if (actionFilter) {
        query.action = actionFilter;
      }

      const automations = await Automation.find(
        query
      ).populate('messageTemplate');

      if (!automations.length) {
        console.log(
          `[Automation] No active automation found for ${triggerType}${
            actionFilter
              ? ` with action ${actionFilter}`
              : ''
          }`
        );

        return {
          success: false,
          message: `No active automation found for ${triggerType}${
            actionFilter
              ? ` with action ${actionFilter}`
              : ''
          }`,
          results: [],
        };
      }

      console.log(
        `[Automation] Found ${automations.length} active automation(s)`
      );

      const results = [];

      for (const automation of automations) {
        try {
          if (
            automation.delay &&
            automation.delay > 0
          ) {
            console.log(
              `[Automation] ${automation.name}: ${automation.delay} minute delay configured`
            );

            // Background scheduling can be added later.
          }

          const result =
            await this.executeAction(
              automation,
              contextData
            );

          results.push({
            automationId:
              automation._id,
            automationName:
              automation.name,
            action:
              automation.action,
            success: true,
            result,
          });
        } catch (error) {
          console.error(
            `[Automation Action Error] ${automation.name}:`,
            error.message
          );

          results.push({
            automationId:
              automation._id,
            automationName:
              automation.name,
            action:
              automation.action,
            success: false,
            error: error.message,
          });
        }
      }

      const successfulResults =
        results.filter(
          (item) => item.success === true
        );

      return {
        success:
          successfulResults.length > 0,
        trigger: triggerType,
        action:
          actionFilter || null,
        results,
      };
    } catch (error) {
      console.error(
        `[Automation Error] Trigger ${triggerType}:`,
        error.message
      );

      return {
        success: false,
        message: error.message,
        results: [],
      };
    }
  }

  // =====================================================
  // EXECUTE AUTOMATION ACTION
  // =====================================================

  async executeAction(
    automation,
    context = {}
  ) {
    const {
      action,
      messageTemplate,
    } = automation;

    console.log(
      `[Automation] Executing "${automation.name}" with action "${action}"`
    );

    const customerObject =
      context.customer &&
      typeof context.customer === 'object'
        ? context.customer
        : null;

    const recipientPhone =
      context.phone ||
      context.customerPhone ||
      (customerObject &&
        customerObject.phone) ||
      '';

    const customerId =
      context.customerId ||
      (customerObject &&
        customerObject._id) ||
      context.customer ||
      null;

    const customerName =
      context.customerName ||
      (customerObject &&
        customerObject.name) ||
      'Valued Customer';

    const serviceName =
      context.serviceName ||
      (
        context.service &&
        typeof context.service === 'object' &&
        context.service.serviceName
      ) ||
      (
        typeof context.service === 'string'
          ? context.service
          : ''
      ) ||
      'HomeTurf Service';

    const appointmentDate =
      context.appointmentDate || '';

    const appointmentTime =
      context.appointmentTime || '';

    let textContent = '';

    if (
      messageTemplate &&
      messageTemplate.content
    ) {
      textContent =
        this.replacePlaceholders(
          messageTemplate.content,
          {
            customerName,
            serviceName,
            appointmentDate,
            appointmentTime,
            ...context,
          }
        );
    }

    // ===================================================
    // SEND MESSAGE
    // ===================================================

    if (action === 'SEND_MESSAGE') {
      if (!messageTemplate) {
        throw new Error(
          `Message template is missing for automation "${automation.name}"`
        );
      }

      if (!textContent) {
        throw new Error(
          `Message content is empty for automation "${automation.name}"`
        );
      }

      if (!recipientPhone) {
        throw new Error(
          `Recipient phone is missing for automation "${automation.name}"`
        );
      }

      const channel =
        String(
          context.channel || 'WHATSAPP'
        ).toUpperCase();

      console.log(
        `[Automation] Sending ${channel} message to ${recipientPhone}`
      );

      let response;

      if (channel === 'WHATSAPP') {
        response =
          await whatsappService.sendMessage({
            to: recipientPhone,
            text: textContent,
            customerId,
          });
      } else if (channel === 'SMS') {
        response =
          await smsService.sendMessage({
            to: recipientPhone,
            text: textContent,
            customerId,
          });
      } else {
        throw new Error(
          `Unsupported automation channel: ${channel}`
        );
      }

      console.log(
        `[Automation] Message sent successfully for "${automation.name}"`
      );

      return response;
    }

    // ===================================================
    // SEND REVIEW REQUEST
    // ===================================================

    if (
      action === 'SEND_REVIEW_REQUEST'
    ) {
      if (!customerId) {
        throw new Error(
          `Customer ID missing for review request: ${automation.name}`
        );
      }

      const serviceId =
        context.serviceId ||
        (
          context.service &&
          typeof context.service === 'object' &&
          context.service._id
        ) ||
        null;

      const response =
        await clickyService.sendReviewRequest(
          {
            customerId,
            serviceId,
            customerPhone:
              recipientPhone,
            customerName,
          }
        );

      console.log(
        `[Automation] Review request created successfully for "${automation.name}"`
      );

      return response;
    }

    // ===================================================
    // NOTIFY STAFF
    // ===================================================

    if (action === 'NOTIFY_STAFF') {
      const notification =
        await Notification.create({
          title: `Automation: ${automation.name}`,
          message:
            textContent ||
            `Action triggered for ${customerName}`,
          type: 'SERVICE_COMPLETED',
          referenceId: customerId,
          referenceType: 'Customer',
        });

      console.log(
        `[Automation] Staff notification created for "${automation.name}"`
      );

      return notification;
    }

    throw new Error(
      `Unsupported automation action "${action}" for ${automation.name}`
    );
  }

  // =====================================================
  // NEW LEAD
  // =====================================================

  async onNewLead(lead) {
    if (!lead) {
      return;
    }

    return this.handleTrigger(
      'NEW_LEAD',
      {
        phone: lead.phone,
        customerName: lead.name,
        leadId: lead._id,
        serviceName:
          lead.service ||
          'Service Inquiry',
        channel: 'WHATSAPP',
      }
    );
  }

  // =====================================================
  // APPOINTMENT CONFIRMED
  // =====================================================

  async onAppointmentConfirmed(
    appointment,
    customer
  ) {
    if (!appointment) {
      return;
    }

    const dateStr =
      appointment.date
        ? new Date(
            appointment.date
          ).toLocaleDateString()
        : '';

    return this.handleTrigger(
      'APPOINTMENT_CONFIRMED',
      {
        phone: customer
          ? customer.phone
          : '',
        customerId: customer
          ? customer._id
          : appointment.customer,
        customerName: customer
          ? customer.name
          : '',
        serviceName:
          appointment.service || '',
        appointmentDate: dateStr,
        appointmentTime:
          appointment.time || '',
        appointmentId:
          appointment._id,
        channel: 'WHATSAPP',
      }
    );
  }

  // =====================================================
  // APPOINTMENT REMINDER
  // =====================================================

  async onAppointmentReminder(
    appointment,
    customer
  ) {
    if (!appointment) {
      return;
    }

    const dateStr =
      appointment.date
        ? new Date(
            appointment.date
          ).toLocaleDateString()
        : '';

    return this.handleTrigger(
      'APPOINTMENT_REMINDER',
      {
        phone: customer
          ? customer.phone
          : '',
        customerId: customer
          ? customer._id
          : appointment.customer,
        customerName: customer
          ? customer.name
          : '',
        serviceName:
          appointment.service || '',
        appointmentDate: dateStr,
        appointmentTime:
          appointment.time || '',
        appointmentId:
          appointment._id,
        channel: 'WHATSAPP',
      }
    );
  }

  // =====================================================
  // APPOINTMENT COMPLETED
  // =====================================================

  async onAppointmentCompleted(
    appointment,
    customer
  ) {
    if (
      !appointment ||
      !customer
    ) {
      return;
    }

    return this.handleTrigger(
      'SERVICE_COMPLETED',
      {
        phone: customer.phone,
        customerId: customer._id,
        customerName: customer.name,
        serviceName:
          appointment.service ||
          'HomeTurf Service',

        // Appointment is NOT a Service.
        // Do not use appointment._id as serviceId.
        appointmentId:
          appointment._id,

        appointmentDate:
          appointment.date
            ? new Date(
                appointment.date
              ).toLocaleDateString()
            : '',

        appointmentTime:
          appointment.time || '',

        channel: 'WHATSAPP',
      }
    );
  }

  // =====================================================
  // SERVICE COMPLETED
  // =====================================================

  async onServiceCompleted(
    service,
    customer
  ) {
    if (
      !service ||
      !customer
    ) {
      return {
        success: false,
        message:
          'Service and customer are required',
      };
    }

    const context = {
      phone: customer.phone || '',
      customerId: customer._id,
      customerName:
        customer.name ||
        'Valued Customer',
      serviceName:
        service.serviceName ||
        'HomeTurf Service',
      serviceId: service._id,
      service,
      channel: 'WHATSAPP',
    };

    // ===================================================
    // STEP 1: THANK YOU MESSAGE
    // ===================================================

    console.log(
      '[Automation] Service completed: starting Thank You automation'
    );

    const thankYouResult =
      await this.handleTrigger(
        'SERVICE_COMPLETED',
        context,
        'SEND_MESSAGE'
      );

    // ===================================================
    // STEP 2: ONLY AFTER THANK YOU SUCCESS
    // START REVIEW REQUEST
    // ===================================================

    const thankYouSucceeded =
      thankYouResult &&
      thankYouResult.results &&
      thankYouResult.results.some(
        (result) =>
          result.success === true
      );

    if (!thankYouSucceeded) {
      console.log(
        '[Automation] Thank You automation did not succeed. Review request will not be triggered.'
      );

      return {
        success: false,
        message:
          'Thank You automation failed or no active Thank You automation exists',
        thankYou:
          thankYouResult,
        reviewRequest: null,
      };
    }

    console.log(
      '[Automation] Thank You sent successfully. Starting Review Request automation'
    );

    const reviewRequestResult =
      await this.handleTrigger(
        'SERVICE_COMPLETED',
        context,
        'SEND_REVIEW_REQUEST'
      );

    return {
      success:
        reviewRequestResult.success,
      message:
        'Service completed automation chain processed',
      thankYou:
        thankYouResult,
      reviewRequest:
        reviewRequestResult,
    };
  }

  // =====================================================
  // REVIEW FOLLOW-UP
  // =====================================================

  async onReviewFollowup(
    review,
    customer
  ) {
    if (!review) {
      console.log(
        '[Automation] Review follow-up skipped: review missing'
      );

      return {
        success: false,
        message: 'Review is required',
      };
    }

    const customerData =
      customer ||
      review.customer ||
      null;

    if (!customerData) {
      console.log(
        '[Automation] Review follow-up skipped: customer missing'
      );

      return {
        success: false,
        message:
          'Customer is required for review follow-up',
      };
    }

    const customerPhone =
      customerData.phone || '';

    const customerId =
      customerData._id ||
      customerData;

    const customerName =
      customerData.name ||
      'Valued Customer';

    console.log(
      `[Automation] Review follow-up started for customer ${customerId}`
    );

    if (!customerPhone) {
      console.log(
        `[Automation] Review follow-up skipped: phone missing for customer ${customerId}`
      );

      return {
        success: false,
        message:
          'Customer phone is required for review follow-up',
      };
    }

    const result =
      await this.handleTrigger(
        'REVIEW_FOLLOWUP',
        {
          phone: customerPhone,
          customerId,
          customerName,
          reviewId: review._id,
          review,
          channel: 'WHATSAPP',
        }
      );

    console.log(
      `[Automation] Review follow-up completed for customer ${customerId}`
    );

    return result;
  }
}

module.exports =
  new AutomationService();