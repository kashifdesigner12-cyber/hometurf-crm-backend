const EmailMessage = require('../models/EmailMessage');

/*
|--------------------------------------------------------------------------
| Send Email
|--------------------------------------------------------------------------
*/

const sendEmail = async ({
  to,
  subject,
  text,
  html,
  conversationId = null,
  autoReplyType = 'GENERAL_REPLY',
  isAutoReply = true,
  inReplyTo = '',
  references = '',
}) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Validate Recipient
    |--------------------------------------------------------------------------
    */

    if (!to) {
      throw new Error(
        'Recipient email is required.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Resend API Key
    |--------------------------------------------------------------------------
    */

    if (!process.env.RESEND_API_KEY) {
      throw new Error(
        'RESEND_API_KEY is not configured.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Sender
    |--------------------------------------------------------------------------
    */

    if (!process.env.EMAIL_FROM) {
      throw new Error(
        'EMAIL_FROM is not configured.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Prepare Email Headers
    |--------------------------------------------------------------------------
    */

    const emailHeaders = {};

    if (inReplyTo) {
      emailHeaders['In-Reply-To'] = inReplyTo;

      emailHeaders['References'] =
        references || inReplyTo;
    }

    /*
    |--------------------------------------------------------------------------
    | Send Email Through Resend
    |--------------------------------------------------------------------------
    */

    const response = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${process.env.RESEND_API_KEY}`,

          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          from:
            process.env.EMAIL_FROM,

          to: [to],

          subject:
            subject || 'HomeTurf',

          text:
            text || '',

          html:
            html || '',

          ...(Object.keys(emailHeaders).length > 0
            ? {
                headers: emailHeaders,
              }
            : {}),
        }),
      }
    );

    const result =
      await response.json();

    /*
    |--------------------------------------------------------------------------
    | Provider Error
    |--------------------------------------------------------------------------
    */

    if (!response.ok) {
      console.error(
        'Resend API error:',
        result
      );

      /*
      |--------------------------------------------------------------------------
      | Save Failed Outgoing Message
      |--------------------------------------------------------------------------
      */

      if (conversationId) {
        try {
          await EmailMessage.create({
            conversation:
              conversationId,

            direction:
              'OUTGOING',

            senderEmail:
              process.env.EMAIL_FROM,

            recipientEmail:
              to,

            subject:
              subject || 'HomeTurf',

            text:
              text || '',

            html:
              html || '',

            isAutoReply,

            autoReplyType:
              isAutoReply
                ? autoReplyType
                : 'NONE',

            deliveryStatus:
              'FAILED',

            errorMessage:
              result?.message ||
              result?.error ||
              'Email could not be sent.',

            inReplyTo:
              inReplyTo || '',

            references:
              references || '',
          });
        } catch (saveError) {
          console.error(
            'Unable to save failed outgoing email:',
            saveError
          );
        }
      }

      throw new Error(
        result?.message ||
          result?.error ||
          'Email could not be sent.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Get Resend Message ID
    |--------------------------------------------------------------------------
    */

    const providerMessageId =
      result?.id ||
      result?.message_id ||
      '';

    /*
    |--------------------------------------------------------------------------
    | Save Successful Outgoing Email
    |--------------------------------------------------------------------------
    */

    let emailMessage = null;

    if (conversationId) {
      emailMessage =
        await EmailMessage.create({
          conversation:
            conversationId,

          direction:
            'OUTGOING',

          senderEmail:
            process.env.EMAIL_FROM,

          recipientEmail:
            to,

          subject:
            subject || 'HomeTurf',

          text:
            text || '',

          html:
            html || '',

          isAutoReply,

          autoReplyType:
            isAutoReply
              ? autoReplyType
              : 'NONE',

          deliveryStatus:
            'SENT',

          providerMessageId,

          messageId:
            providerMessageId,

          inReplyTo:
            inReplyTo || '',

          references:
            references || '',
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Return Result
    |--------------------------------------------------------------------------
    */

    return {
      success: true,

      messageId:
        providerMessageId,

      providerMessageId,

      data:
        emailMessage,
    };
  } catch (error) {
    console.error(
      'Send email error:',
      error
    );

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Initial Automatic Reply
|--------------------------------------------------------------------------
*/

const sendInitialAutoReply = async ({
  customerEmail,
  customerName = '',
  conversationId,
  inReplyTo = '',
  references = '',
}) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Validate Customer Email
    |--------------------------------------------------------------------------
    */

    if (!customerEmail) {
      throw new Error(
        'Customer email is required for automatic reply.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Customer First Name
    |--------------------------------------------------------------------------
    */

    const firstName =
      customerName?.trim()
        ? customerName
            .trim()
            .split(/\s+/)[0]
        : 'there';

    /*
    |--------------------------------------------------------------------------
    | Subject
    |--------------------------------------------------------------------------
    */

    const subject =
      'Thanks for contacting HomeTurf';

    /*
    |--------------------------------------------------------------------------
    | Plain Text Email
    |--------------------------------------------------------------------------
    */

    const text = `Hi ${firstName},

Thank you for contacting HomeTurf!

We'd be happy to help you with your request.

To help our team understand your requirements, please reply with the following information:

Full Name:
Phone Number:
Property Address:
Service Required:
Approximate Lawn Size:
Preferred Service Date:

Your email address is already recorded from this email, so you do not need to provide it again.

Once we receive this information, our team will review your request and get back to you.

Thank you for choosing HomeTurf.

Best regards,
HomeTurf Team`;

    /*
    |--------------------------------------------------------------------------
    | HTML Email
    |--------------------------------------------------------------------------
    */

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 650px;
          margin: 0 auto;
          padding: 20px;
        "
      >

        <h2
          style="
            color: #5E52B7;
            margin-bottom: 20px;
          "
        >
          Thanks for contacting HomeTurf
        </h2>

        <p>
          Hi ${firstName},
        </p>

        <p>
          Thank you for contacting HomeTurf!
        </p>

        <p>
          We'd be happy to help you with your request.
        </p>

        <p>
          To help our team understand your requirements,
          please reply with the following information:
        </p>

        <div
          style="
            background: #f8f7ff;
            border: 1px solid #e4e0ff;
            border-radius: 10px;
            padding: 18px;
            margin: 20px 0;
          "
        >

          <p style="margin: 8px 0;">
            <strong>Full Name:</strong>
          </p>

          <p style="margin: 8px 0;">
            <strong>Phone Number:</strong>
          </p>

          <p style="margin: 8px 0;">
            <strong>Property Address:</strong>
          </p>

          <p style="margin: 8px 0;">
            <strong>Service Required:</strong>
          </p>

          <p style="margin: 8px 0;">
            <strong>Approximate Lawn Size:</strong>
          </p>

          <p style="margin: 8px 0;">
            <strong>Preferred Service Date:</strong>
          </p>

        </div>

        <p>
          Your email address is already recorded from this email,
          so you do not need to provide it again.
        </p>

        <p>
          Once we receive this information, our team will
          review your request and get back to you.
        </p>

        <p>
          Thank you for choosing HomeTurf.
        </p>

        <p>
          Best regards,<br />
          <strong>HomeTurf Team</strong>
        </p>

      </div>
    `;

    /*
    |--------------------------------------------------------------------------
    | Send Automatic Reply
    |--------------------------------------------------------------------------
    */

    const result =
      await sendEmail({
        to:
          customerEmail,

        subject,

        text,

        html,

        conversationId,

        autoReplyType:
          'INITIAL_REQUEST',

        isAutoReply:
          true,

        inReplyTo,

        references,
      });

    /*
    |--------------------------------------------------------------------------
    | Return Auto Reply Result
    |--------------------------------------------------------------------------
    */

    return {
      success:
        Boolean(result?.success),

      messageId:
        result?.messageId || '',

      providerMessageId:
        result?.providerMessageId || '',

      data:
        result?.data || null,
    };
  } catch (error) {
    console.error(
      'Initial automatic reply error:',
      error
    );

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  sendEmail,
  sendInitialAutoReply,
};