const { google } = require('googleapis');
const GmailConnection = require('../models/GmailConnection');
const EmailConversation = require('../models/EmailConversation');
const EmailMessage = require('../models/EmailMessage');

/*
|--------------------------------------------------------------------------
| Gmail OAuth Client
|--------------------------------------------------------------------------
*/

const getGmailOAuthClient = () => {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    throw new Error(
      'Google OAuth client credentials are not configured.'
    );
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:5000/api/emails/google/callback'
  );
};

/*
|--------------------------------------------------------------------------
| Decode Gmail Base64 URL Data
|--------------------------------------------------------------------------
*/

const decodeBase64Url = (data = '') => {
  if (!data) {
    return '';
  }

  try {
    const normalized = data
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const padding =
      normalized.length % 4;

    const padded =
      padding
        ? normalized +
          '='.repeat(4 - padding)
        : normalized;

    return Buffer.from(
      padded,
      'base64'
    ).toString('utf8');
  } catch (error) {
    console.error(
      'Gmail base64 decode error:',
      error
    );

    return '';
  }
};

/*
|--------------------------------------------------------------------------
| Encode Gmail Base64 URL Data
|--------------------------------------------------------------------------
*/

const encodeBase64Url = (data = '') => {
  return Buffer.from(
    data,
    'utf8'
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

/*
|--------------------------------------------------------------------------
| Get Header Value
|--------------------------------------------------------------------------
*/

const getHeader = (
  headers = [],
  name
) => {
  const normalizedName =
    String(name || '').toLowerCase();

  const header =
    headers.find(
      (item) =>
        item?.name?.toLowerCase() ===
        normalizedName
    );

  return header?.value || '';
};

/*
|--------------------------------------------------------------------------
| Extract Email Address
|--------------------------------------------------------------------------
*/

const extractEmailAddress = (
  value = ''
) => {
  if (!value) {
    return '';
  }

  const stringValue =
    String(value).trim();

  const match =
    stringValue.match(
      /<([^>]+)>/
    );

  if (match?.[1]) {
    return match[1]
      .trim()
      .toLowerCase();
  }

  return stringValue
    .replace(/^.*\s/, '')
    .replace(/[<>]/g, '')
    .trim()
    .toLowerCase();
};

/*
|--------------------------------------------------------------------------
| Extract Sender Name
|--------------------------------------------------------------------------
*/

const extractSenderName = (
  value = ''
) => {
  if (!value) {
    return '';
  }

  const match =
    String(value).match(
      /^"?([^"<]+?)"?\s*<[^>]+>$/
    );

  if (match?.[1]) {
    return match[1].trim();
  }

  return '';
};

/*
|--------------------------------------------------------------------------
| Escape HTML
|--------------------------------------------------------------------------
*/

const escapeHtml = (
  value = ''
) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/*
|--------------------------------------------------------------------------
| Encode Header Value
|--------------------------------------------------------------------------
|
| Used for UTF-8 subject/name values.
|--------------------------------------------------------------------------
*/

const encodeHeaderValue = (
  value = ''
) => {
  const stringValue =
    String(value);

  if (
    /^[\x00-\x7F]*$/.test(
      stringValue
    )
  ) {
    return stringValue;
  }

  return `=?UTF-8?B?${Buffer.from(
    stringValue,
    'utf8'
  ).toString('base64')}?=`;
};

/*
|--------------------------------------------------------------------------
| Extract Message Body
|--------------------------------------------------------------------------
*/

const extractMessageBody = (
  payload
) => {
  if (!payload) {
    return {
      text: '',
      html: '',
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Direct Body
  |--------------------------------------------------------------------------
  */

  if (
    payload.body?.data &&
    (
      payload.mimeType ===
        'text/plain' ||
      payload.mimeType ===
        'text/html'
    )
  ) {
    const decoded =
      decodeBase64Url(
        payload.body.data
      );

    if (
      payload.mimeType ===
      'text/html'
    ) {
      return {
        text: '',
        html: decoded,
      };
    }

    return {
      text: decoded,
      html: '',
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Multipart Body
  |--------------------------------------------------------------------------
  */

  let text = '';
  let html = '';

  const parts =
    payload.parts || [];

  for (const part of parts) {
    const result =
      extractMessageBody(part);

    if (
      result.text &&
      !text
    ) {
      text =
        result.text;
    }

    if (
      result.html &&
      !html
    ) {
      html =
        result.html;
    }

    if (
      text &&
      html
    ) {
      break;
    }
  }

  return {
    text,
    html,
  };
};

/*
|--------------------------------------------------------------------------
| Get Gmail Connection
|--------------------------------------------------------------------------
*/

const getGmailConnection =
  async () => {
    const gmailEmail =
      process.env.EMAIL_INBOX
        ?.trim()
        .toLowerCase();

    if (!gmailEmail) {
      throw new Error(
        'EMAIL_INBOX is not configured.'
      );
    }

    const connection =
      await GmailConnection.findOne({
        email: gmailEmail,
        connected: true,
      }).select(
        '+accessToken +refreshToken'
      );

    if (!connection) {
      throw new Error(
        `Gmail connection not found for ${gmailEmail}. Please connect Gmail first.`
      );
    }

    if (!connection.refreshToken) {
      throw new Error(
        'Gmail refresh token is missing. Please reconnect Gmail.'
      );
    }

    return connection;
  };

/*
|--------------------------------------------------------------------------
| Create Authenticated Gmail Client
|--------------------------------------------------------------------------
*/

const getGmailClient =
  async () => {
    const connection =
      await getGmailConnection();

    const oauth2Client =
      getGmailOAuthClient();

    oauth2Client.setCredentials({
      access_token:
        connection.accessToken ||
        undefined,

      refresh_token:
        connection.refreshToken,

      expiry_date:
        connection.tokenExpiry
          ? new Date(
              connection.tokenExpiry
            ).getTime()
          : undefined,
    });

    /*
    |--------------------------------------------------------------------------
    | Save Refreshed Access Token
    |--------------------------------------------------------------------------
    */

    oauth2Client.on(
      'tokens',
      async (tokens) => {
        try {
          let changed = false;

          if (
            tokens.access_token
          ) {
            connection.accessToken =
              tokens.access_token;

            changed = true;
          }

          if (
            tokens.refresh_token
          ) {
            connection.refreshToken =
              tokens.refresh_token;

            changed = true;
          }

          if (
            tokens.expiry_date
          ) {
            connection.tokenExpiry =
              new Date(
                tokens.expiry_date
              );

            changed = true;
          }

          if (changed) {
            await connection.save();
          }
        } catch (error) {
          console.error(
            'Unable to save refreshed Gmail token:',
            error
          );
        }
      }
    );

    const gmail =
      google.gmail({
        version: 'v1',
        auth: oauth2Client,
      });

    return {
      gmail,
      connection,
    };
  };

/*
|--------------------------------------------------------------------------
| Get Gmail Message Details
|--------------------------------------------------------------------------
*/

const getGmailMessage =
  async (
    gmail,
    messageId
  ) => {
    const response =
      await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

    return response.data;
  };

/*
|--------------------------------------------------------------------------
| Move Gmail Thread To Trash
|--------------------------------------------------------------------------
|
| Kept only for compatibility.
|
| CRM deletion currently does NOT call this function.
|--------------------------------------------------------------------------
*/

const deleteGmailThread =
  async (
    threadId
  ) => {
    try {
      if (!threadId) {
        throw new Error(
          'Gmail thread ID is required.'
        );
      }

      const {
        gmail,
      } = await getGmailClient();

      await gmail.users.threads.trash({
        userId: 'me',
        id: threadId,
      });

      console.log(
        `Gmail thread moved to Trash successfully: ${threadId}`
      );

      return {
        success: true,
        threadId,
        trashed: true,
        message:
          'Gmail thread moved to Trash successfully.',
      };
    } catch (error) {
      console.error(
        `Gmail thread trash failed for ${threadId}:`,
        error
      );

      throw new Error(
        error?.message ||
        'Unable to move Gmail thread to Trash.'
      );
    }
  };

/*
|--------------------------------------------------------------------------
| Build Initial Auto Reply
|--------------------------------------------------------------------------
*/

const buildInitialAutoReply = ({
  senderName = '',
}) => {
  const firstName =
    senderName
      ?.trim()
      ?.split(/\s+/)[0] ||
    'there';

  const subject =
    'Thanks for contacting HomeTurf';

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

  const safeFirstName =
    escapeHtml(firstName);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <p>Hi ${safeFirstName},</p>

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

      <p>
        <strong>Full Name:</strong><br>
        <strong>Phone Number:</strong><br>
        <strong>Property Address:</strong><br>
        <strong>Service Required:</strong><br>
        <strong>Approximate Lawn Size:</strong><br>
        <strong>Preferred Service Date:</strong>
      </p>

      <p>
        Your email address is already recorded from this email,
        so you do not need to provide it again.
      </p>

      <p>
        Once we receive this information, our team will review
        your request and get back to you.
      </p>

      <p>
        Thank you for choosing HomeTurf.
      </p>

      <p>
        Best regards,<br>
        <strong>HomeTurf Team</strong>
      </p>
    </div>
  `;

  return {
    subject,
    text,
    html,
  };
};

/*
|--------------------------------------------------------------------------
| Create RFC Message ID
|--------------------------------------------------------------------------
*/

const createRfcMessageId = (
  from
) => {
  const domain =
    from?.split('@')[1] ||
    'gmail.com';

  return `<${Date.now()}.${process.hrtime.bigint().toString()}@${domain}>`;
};

/*
|--------------------------------------------------------------------------
| Normalize References
|--------------------------------------------------------------------------
*/

const normalizeReferences = (
  references = '',
  inReplyTo = ''
) => {
  const values = [];

  const addReferences = (
    value
  ) => {
    if (!value) {
      return;
    }

    const matches =
      String(value).match(
        /<[^>]+>/g
      );

    if (matches) {
      matches.forEach(
        (item) => {
          if (
            !values.includes(item)
          ) {
            values.push(item);
          }
        }
      );
    }
  };

  addReferences(
    references
  );

  addReferences(
    inReplyTo
  );

  return values.join(' ');
};

/*
|--------------------------------------------------------------------------
| Send Email Directly Through Gmail API
|--------------------------------------------------------------------------
|
| This function is used by:
| - Manual CRM replies
| - Gmail automatic replies
|--------------------------------------------------------------------------
*/

const sendGmailEmail =
  async ({
    to,
    subject,
    text,
    html,
    threadId = '',
    inReplyTo = '',
    references = '',
    conversationId = null,
    isAutoReply = false,
    autoReplyType = 'GENERAL_REPLY',
  }) => {
    if (!to) {
      throw new Error(
        'Recipient email is required.'
      );
    }

    const {
      gmail,
    } = await getGmailClient();

    const from =
      process.env.EMAIL_INBOX
        ?.trim()
        .toLowerCase();

    if (!from) {
      throw new Error(
        'EMAIL_INBOX is not configured.'
      );
    }

    const normalizedTo =
      extractEmailAddress(to);

    if (!normalizedTo) {
      throw new Error(
        'Recipient email address is invalid.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | RFC Message ID
    |--------------------------------------------------------------------------
    */

    const generatedMessageId =
      createRfcMessageId(
        from
      );

    /*
    |--------------------------------------------------------------------------
    | References
    |--------------------------------------------------------------------------
    */

    const normalizedReferences =
      normalizeReferences(
        references,
        inReplyTo
      );

    /*
    |--------------------------------------------------------------------------
    | Headers
    |--------------------------------------------------------------------------
    */

    const emailHeaders = [
      `From: HomeTurf <${from}>`,
      `To: ${normalizedTo}`,
      `Subject: ${encodeHeaderValue(
        subject || 'HomeTurf'
      )}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${generatedMessageId}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="HomeTurfBoundary"',
    ];

    /*
    |--------------------------------------------------------------------------
    | Reply Headers
    |--------------------------------------------------------------------------
    */

    if (inReplyTo) {
      emailHeaders.push(
        `In-Reply-To: ${inReplyTo}`
      );
    }

    if (normalizedReferences) {
      emailHeaders.push(
        `References: ${normalizedReferences}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Build MIME Message
    |--------------------------------------------------------------------------
    */

    const plainText =
      text ||
      '';

    const htmlText =
      html ||
      `<div style="font-family: Arial, sans-serif; line-height: 1.6;">
        ${escapeHtml(
          plainText
        ).replace(
          /\n/g,
          '<br>'
        )}
      </div>`;

    const rawMessage = [
      ...emailHeaders,

      '',

      '--HomeTurfBoundary',

      'Content-Type: text/plain; charset="UTF-8"',

      'Content-Transfer-Encoding: 8bit',

      '',

      plainText,

      '',

      '--HomeTurfBoundary',

      'Content-Type: text/html; charset="UTF-8"',

      'Content-Transfer-Encoding: 8bit',

      '',

      htmlText,

      '',

      '--HomeTurfBoundary--',
    ].join('\r\n');

    const encodedMessage =
      encodeBase64Url(
        rawMessage
      );

    /*
    |--------------------------------------------------------------------------
    | Gmail API Send
    |--------------------------------------------------------------------------
    */

    const requestBody = {
      raw:
        encodedMessage,
    };

    /*
    |--------------------------------------------------------------------------
    | Gmail Thread
    |--------------------------------------------------------------------------
    |
    | Only attach threadId when a real Gmail thread ID exists.
    |--------------------------------------------------------------------------
    */

    if (threadId) {
      requestBody.threadId =
        threadId;
    }

    const response =
      await gmail.users.messages.send({
        userId: 'me',
        requestBody,
      });

    const sentMessage =
      response?.data || {};

    if (!sentMessage.id) {
      throw new Error(
        'Gmail API did not return a sent message ID.'
      );
    }

    console.log(
      `Gmail email accepted successfully by Gmail API for ${normalizedTo}: ${sentMessage.id}`
    );

    /*
    |--------------------------------------------------------------------------
    | Save Outgoing Message In MongoDB
    |--------------------------------------------------------------------------
    |
    | Important:
    | Gmail API success means Gmail accepted the message.
    | It does not guarantee final recipient delivery.
    |--------------------------------------------------------------------------
    */

    let outgoingMessage = null;

    if (conversationId) {
      outgoingMessage =
        await EmailMessage.create({
          conversation:
            conversationId,

          direction:
            'OUTGOING',

          senderEmail:
            from,

          recipientEmail:
            normalizedTo,

          senderName:
            'HomeTurf Team',

          subject:
            subject ||
            'HomeTurf',

          text:
            plainText,

          html:
            htmlText,

          /*
          |--------------------------------------------------------------------
          | Actual RFC Message ID
          |--------------------------------------------------------------------
          */

          messageId:
            generatedMessageId,

          /*
          |--------------------------------------------------------------------
          | Gmail API Message ID
          |--------------------------------------------------------------------
          */

          gmailMessageId:
            sentMessage.id,

          /*
          |--------------------------------------------------------------------
          | Gmail Thread ID
          |--------------------------------------------------------------------
          */

          gmailThreadId:
            sentMessage.threadId ||
            threadId ||
            '',

          providerMessageId:
            sentMessage.id,

          inReplyTo:
            inReplyTo ||
            '',

          references:
            normalizedReferences,

          isAutoReply:
            Boolean(isAutoReply),

          autoReplyType:
            autoReplyType ||
            'GENERAL_REPLY',

          deliveryStatus:
            'SENT',
        });

      /*
      |--------------------------------------------------------------------------
      | Update Conversation
      |--------------------------------------------------------------------------
      */

      try {
        await EmailConversation.findByIdAndUpdate(
          conversationId,
          {
            $set: {
              latestMessageId:
                generatedMessageId,

              lastMessage:
                plainText ||
                'Email sent to customer.',

              lastMessageAt:
                new Date(),

              status:
                isAutoReply
                  ? 'WAITING'
                  : 'IN_PROGRESS',

              ...(sentMessage.threadId
                ? {
                    gmailThreadId:
                      sentMessage.threadId,
                  }
                : {}),
            },
          }
        );
      } catch (conversationUpdateError) {
        console.error(
          'Outgoing email conversation update error:',
          conversationUpdateError
        );
      }
    }

    return {
      success: true,

      messageId:
        sentMessage.id,

      gmailMessageId:
        sentMessage.id,

      providerMessageId:
        sentMessage.id,

      threadId:
        sentMessage.threadId ||
        threadId ||
        '',

      rfcMessageId:
        generatedMessageId,

      outgoingMessageId:
        outgoingMessage?._id ||
        null,

      to:
        normalizedTo,

      from,
    };
  };

/*
|--------------------------------------------------------------------------
| Send Initial Auto Reply Through Gmail
|--------------------------------------------------------------------------
*/

const sendGmailAutoReply =
  async ({
    conversation,
    senderEmail,
    senderName,
    messageId,
    references,
    rfcMessageId = '',
  }) => {
    try {
      if (!conversation?._id) {
        throw new Error(
          'Conversation ID is required for auto reply.'
        );
      }

      if (!senderEmail) {
        throw new Error(
          'Customer email is required for auto reply.'
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Prevent Duplicate Initial Auto Replies
      |--------------------------------------------------------------------------
      */

      const existingAutoReply =
        await EmailMessage.findOne({
          conversation:
            conversation._id,

          direction:
            'OUTGOING',

          isAutoReply:
            true,

          autoReplyType:
            'INITIAL_REQUEST',
        });

      if (existingAutoReply) {
        console.log(
          `Initial auto reply already exists for ${senderEmail}.`
        );

        return {
          success: true,
          skipped: true,

          reason:
            'Initial auto reply already exists.',

          messageId:
            existingAutoReply._id,
        };
      }

      /*
      |--------------------------------------------------------------------------
      | Build Reply
      |--------------------------------------------------------------------------
      */

      const {
        subject,
        text,
        html,
      } =
        buildInitialAutoReply({
          senderName,
        });

      /*
      |--------------------------------------------------------------------------
      | Send Through Gmail API
      |--------------------------------------------------------------------------
      |
      | IMPORTANT:
      | Use the actual RFC Message-ID of the incoming email.
      | Do NOT use Gmail API message ID as In-Reply-To.
      |--------------------------------------------------------------------------
      */

      const result =
        await sendGmailEmail({
          to:
            senderEmail,

          subject,

          text,

          html,

          threadId:
            conversation.gmailThreadId ||
            '',

          inReplyTo:
            rfcMessageId ||
            '',

          references:
            references ||
            rfcMessageId ||
            '',
          
          conversationId:
            conversation._id,

          isAutoReply:
            true,

          autoReplyType:
            'INITIAL_REQUEST',
        });

      /*
      |--------------------------------------------------------------------------
      | Update Conversation
      |--------------------------------------------------------------------------
      */

      conversation.status =
        'WAITING';

      conversation.lastMessage =
        'Automatic reply sent to customer.';

      conversation.lastMessageAt =
        new Date();

      if (
        result.threadId
      ) {
        conversation.gmailThreadId =
          result.threadId;
      }

      await conversation.save();

      console.log(
        `Automatic Gmail reply sent successfully to ${senderEmail}`
      );

      return {
        success: true,

        skipped: false,

        providerMessageId:
          result.providerMessageId ||
          result.messageId ||
          '',

        messageId:
          result.outgoingMessageId ||
          null,

        gmailMessageId:
          result.messageId ||
          '',

        gmailThreadId:
          result.threadId ||
          '',
      };
    } catch (error) {
      console.error(
        `Automatic Gmail reply failed for ${senderEmail}:`,
        error
      );

      return {
        success: false,

        skipped: false,

        error:
          error.message ||
          'Automatic Gmail reply failed.',
      };
    }
  };

/*
|--------------------------------------------------------------------------
| Process Gmail Message
|--------------------------------------------------------------------------
*/

const processGmailMessage =
  async (
    gmailMessage
  ) => {
    const gmailMessageId =
      gmailMessage?.id || '';

    const threadId =
      gmailMessage?.threadId || '';

    if (!gmailMessageId) {
      return {
        success: false,
        skipped: true,
        reason:
          'Gmail message ID missing.',
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Duplicate Check
    |--------------------------------------------------------------------------
    */

    const existingMessage =
      await EmailMessage.findOne({
        $or: [
          {
            gmailMessageId:
              gmailMessageId,
          },

          {
            providerMessageId:
              gmailMessageId,
          },
        ],
      });

    if (existingMessage) {
      return {
        success: true,

        skipped: true,

        reason:
          'Message already exists.',

        messageId:
          gmailMessageId,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Gmail Headers
    |--------------------------------------------------------------------------
    */

    const headers =
      gmailMessage?.payload
        ?.headers || [];

    const fromHeader =
      getHeader(
        headers,
        'From'
      );

    const toHeader =
      getHeader(
        headers,
        'To'
      );

    const subject =
      getHeader(
        headers,
        'Subject'
      ) ||
      'New HomeTurf Email';

    const dateHeader =
      getHeader(
        headers,
        'Date'
      );

    /*
    |--------------------------------------------------------------------------
    | IMPORTANT:
    | Actual RFC Message-ID
    |--------------------------------------------------------------------------
    */

    const rfcMessageId =
      getHeader(
        headers,
        'Message-ID'
      );

    const inReplyTo =
      getHeader(
        headers,
        'In-Reply-To'
      );

    const references =
      getHeader(
        headers,
        'References'
      );

    /*
    |--------------------------------------------------------------------------
    | Sender
    |--------------------------------------------------------------------------
    */

    const senderEmail =
      extractEmailAddress(
        fromHeader
      );

    const senderName =
      extractSenderName(
        fromHeader
      );

    const recipientEmail =
      extractEmailAddress(
        toHeader
      ) ||
      process.env.EMAIL_INBOX ||
      '';

    if (!senderEmail) {
      return {
        success: false,

        skipped: true,

        reason:
          'Sender email could not be determined.',

        messageId:
          gmailMessageId,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Ignore Our Own Gmail Account
    |--------------------------------------------------------------------------
    */

    if (
      senderEmail ===
      process.env.EMAIL_INBOX
        ?.trim()
        .toLowerCase()
    ) {
      return {
        success: true,

        skipped: true,

        reason:
          'Own Gmail message skipped.',

        messageId:
          gmailMessageId,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Extract Body
    |--------------------------------------------------------------------------
    */

    const {
      text,
      html,
    } =
      extractMessageBody(
        gmailMessage?.payload
      );

    const emailText =
      text ||
      gmailMessage?.snippet ||
      '';

    /*
    |--------------------------------------------------------------------------
    | Find Existing Conversation
    |--------------------------------------------------------------------------
    */

    let conversation =
      await EmailConversation.findOne({
        customerEmail:
          senderEmail,
      });

    const isNewConversation =
      !conversation;

    /*
    |--------------------------------------------------------------------------
    | Create Conversation
    |--------------------------------------------------------------------------
    */

    if (!conversation) {
      conversation =
        await EmailConversation.create({
          customerName:
            senderName,

          customerEmail:
            senderEmail,

          subject,

          status:
            'NEW',

          lastMessage:
            emailText ||
            subject,

          lastMessageAt:
            dateHeader
              ? new Date(
                  dateHeader
                )
              : new Date(),

          gmailThreadId:
            threadId,
        });
    } else {
      /*
      |--------------------------------------------------------------------------
      | Update Existing Conversation
      |--------------------------------------------------------------------------
      */

      if (
        senderName &&
        !conversation.customerName
      ) {
        conversation.customerName =
          senderName;
      }

      if (
        subject &&
        !conversation.subject
      ) {
        conversation.subject =
          subject;
      }

      if (
        threadId
      ) {
        conversation.gmailThreadId =
          threadId;
      }

      conversation.lastMessage =
        emailText ||
        subject;

      conversation.lastMessageAt =
        dateHeader
          ? new Date(
              dateHeader
            )
          : new Date();

      if (
        conversation.status ===
        'IN_PROGRESS'
      ) {
        conversation.status =
          'WAITING';
      }

      await conversation.save();
    }

    /*
    |--------------------------------------------------------------------------
    | Save Incoming Message
    |--------------------------------------------------------------------------
    */

    const incomingMessage =
      await EmailMessage.create({
        conversation:
          conversation._id,

        direction:
          'INCOMING',

        senderEmail,

        recipientEmail,

        senderName,

        subject,

        text:
          emailText,

        html,

        /*
        |----------------------------------------------------------------------
        | Store ACTUAL RFC Message-ID
        |----------------------------------------------------------------------
        */

        messageId:
          rfcMessageId ||
          gmailMessageId,

        /*
        |----------------------------------------------------------------------
        | Store Gmail API Message ID separately
        |----------------------------------------------------------------------
        */

        gmailMessageId:
          gmailMessageId,

        gmailThreadId:
          threadId,

        inReplyTo,

        references,

        providerMessageId:
          gmailMessageId,

        isAutoReply:
          false,

        autoReplyType:
          'NONE',

        deliveryStatus:
          'DELIVERED',
      });

    /*
    |--------------------------------------------------------------------------
    | Update Latest Message Information
    |--------------------------------------------------------------------------
    */

    conversation.latestMessageId =
      rfcMessageId ||
      gmailMessageId;

    conversation.gmailThreadId =
      threadId ||
      conversation.gmailThreadId ||
      '';

    conversation.lastMessage =
      emailText ||
      subject;

    conversation.lastMessageAt =
      dateHeader
        ? new Date(
            dateHeader
          )
        : new Date();

    await conversation.save();

    /*
    |--------------------------------------------------------------------------
    | Automatic Initial Reply
    |--------------------------------------------------------------------------
    */

    let autoReply = null;

    if (isNewConversation) {
      autoReply =
        await sendGmailAutoReply({
          conversation,

          senderEmail,

          senderName,

          /*
          | IMPORTANT:
          | Pass RFC Message-ID, not Gmail API ID.
          */

          messageId:
            gmailMessageId,

          rfcMessageId:
            rfcMessageId,

          references,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Return Result
    |--------------------------------------------------------------------------
    */

    return {
      success: true,

      skipped: false,

      isNewConversation,

      autoReplySent:
        Boolean(
          autoReply?.success &&
          !autoReply?.skipped
        ),

      autoReplySkipped:
        Boolean(
          autoReply?.skipped
        ),

      autoReplyError:
        autoReply?.error ||
        '',

      conversationId:
        conversation._id,

      messageId:
        incomingMessage._id,

      gmailMessageId,

      gmailThreadId:
        threadId,

      rfcMessageId:
        rfcMessageId ||
        '',

      customerEmail:
        senderEmail,

      customerName:
        senderName,

      subject,
    };
  };

/*
|--------------------------------------------------------------------------
| Sync Gmail Inbox
|--------------------------------------------------------------------------
*/

const syncGmailInbox =
  async () => {
    try {
      const {
        gmail,
        connection,
      } =
        await getGmailClient();

      /*
      |--------------------------------------------------------------------------
      | Get Inbox Messages
      |--------------------------------------------------------------------------
      |
      | Only INBOX messages are synchronized.
      |--------------------------------------------------------------------------
      */

      const response =
        await gmail.users.messages.list({
          userId: 'me',

          labelIds: [
            'INBOX',
          ],

          maxResults: 50,
        });

      const messages =
        response?.data?.messages ||
        [];

      if (
        messages.length === 0
      ) {
        connection.lastSyncAt =
          new Date();

        await connection.save();

        return {
          success: true,

          message:
            'No Gmail inbox messages found.',

          processed: 0,

          skipped: 0,

          total: 0,

          autoRepliesSent: 0,

          syncedAt:
            connection.lastSyncAt,
        };
      }

      let processed = 0;
      let skipped = 0;
      let autoRepliesSent = 0;

      /*
      |--------------------------------------------------------------------------
      | Process Gmail Messages
      |--------------------------------------------------------------------------
      */

      for (
        const messageInfo of messages
      ) {
        try {
          const gmailMessage =
            await getGmailMessage(
              gmail,
              messageInfo.id
            );

          const result =
            await processGmailMessage(
              gmailMessage
            );

          if (
            result.skipped
          ) {
            skipped++;

            console.log(
              `Gmail message skipped: ${messageInfo.id} - ${
                result.reason ||
                'Unknown reason'
              }`
            );
          } else if (
            result.success
          ) {
            processed++;

            if (
              result.autoReplySent
            ) {
              autoRepliesSent++;
            }

            console.log(
              `Gmail message processed successfully: ${messageInfo.id}`
            );

            if (
              result.autoReplySent
            ) {
              console.log(
                `Automatic Gmail reply sent to ${result.customerEmail}`
              );
            }

            if (
              result.autoReplyError
            ) {
              console.error(
                `Automatic Gmail reply error for ${result.customerEmail}: ${result.autoReplyError}`
              );
            }
          }
        } catch (
          messageError
        ) {
          skipped++;

          console.error(
            `Gmail message ${messageInfo.id} processing error:`,
            messageError.message
          );
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Update Last Sync
      |--------------------------------------------------------------------------
      */

      connection.lastSyncAt =
        new Date();

      await connection.save();

      return {
        success: true,

        message:
          'Gmail inbox sync completed.',

        processed,

        skipped,

        total:
          messages.length,

        autoRepliesSent,

        syncedAt:
          connection.lastSyncAt,
      };
    } catch (error) {
      console.error(
        'Gmail inbox sync error:',
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
  getGmailOAuthClient,
  getGmailConnection,
  getGmailClient,
  getGmailMessage,
  deleteGmailThread,
  sendGmailEmail,
  sendGmailAutoReply,
  syncGmailInbox,
  processGmailMessage,
};

