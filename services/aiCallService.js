const Call = require('../models/Call');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');

/**
 * AI Call Integration Service
 */
class AICallService {
  constructor() {
    this.apiUrl = process.env.AI_CALL_API_URL || '';
    this.apiKey = process.env.AI_CALL_API_KEY || '';
  }

  async handleIncomingCallWebhook(callData) {
    const {
      callerPhone,
      direction = 'INCOMING',
      status = 'COMPLETED',
      duration = 0,
      recordingUrl = '',
      transcript = '',
      summary = '',
      outcome = '',
      transferredTo = '',
      startedAt = new Date(),
      endedAt = new Date(),
      callerName = '',
    } = callData;

    if (!callerPhone) {
      throw new Error('Caller phone number is required for AI call processing');
    }

    // 1. Find existing customer by phone number
    let customer = await Customer.findOne({ phone: callerPhone });
    let lead = null;

    // 2. If customer does not exist, check or create lead
    if (!customer) {
      lead = await Lead.findOne({ phone: callerPhone });

      if (!lead) {
        lead = await Lead.create({
          name: callerName || `Caller ${callerPhone}`,
          phone: callerPhone,
          source: 'PHONE',
          message: summary || transcript || 'Inbound AI Call Inquiry',
          status: 'NEW',
          notes: `AI Call Outcome: ${outcome || 'Inquiry'}`,
        });

        await logActivity({
          lead: lead._id,
          action: 'LEAD_CREATED',
          description: `New lead created from inbound AI call: ${lead.name}`,
        });
      }
    }

    // 3. Save call details
    const call = await Call.create({
      customer: customer ? customer._id : null,
      lead: lead ? lead._id : null,
      phoneNumber: callerPhone,
      direction,
      status,
      duration,
      recordingUrl,
      transcript,
      summary,
      outcome,
      transferredTo,
      startedAt,
      endedAt,
    });

    // 4. Create Notification
    const notifType = status === 'MISSED' ? 'MISSED_CALL' : 'NEW_CALL';
    await Notification.create({
      title: status === 'MISSED' ? 'Missed AI Call' : 'New AI Call Logged',
      message: `Call with ${customer ? customer.name : (lead ? lead.name : callerPhone)}: ${outcome || summary || 'Call completed'}`,
      type: notifType,
      referenceId: call._id,
      referenceType: 'Call',
    });

    // 5. Log Activity
    await logActivity({
      customer: customer ? customer._id : null,
      lead: lead ? lead._id : null,
      action: 'CALL_RECEIVED',
      description: `AI ${direction.toLowerCase()} call (${duration}s) - Outcome: ${outcome || 'N/A'}`,
    });

    return {
      call,
      customer,
      lead,
    };
  }
}

module.exports = new AICallService();