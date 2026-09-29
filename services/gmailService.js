const { google } = require('googleapis');

const GmailConnection = require('../models/GmailConnection');
const EmailConversation = require('../models/EmailConversation');
const EmailMessage = require('../models/EmailMessage');

const {
  sendInitialAutoReply,
} = require('./emailService');

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
    return Buffer.from(
      data
        .replace(/-/g, '+')
        .replace(/_/g, '/'),
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
| Get Header Value
|--------------------------------------------------------------------------
*/

const getHeader = (
  headers = [],
  name
) => {
  const header =
    headers.find(
      (item) =>
        item.name?.toLowerCase() ===
        name.toLowerCase()
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

  const match =
    value.match(
      /<([^>]+)>/
    );

  if (match?.[1]) {
    return match[1]
      .trim()
      .toLowerCase();
  }

  return value
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
    value.match(
      /^"?([^"<]+?)"?\s*<[^>]+>$/
    );

  if (match?.[1]) {
    return match[1].trim();
  }

  return '';
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
      extractMessageBody(
        part
      );

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

    if (
      !connection.refreshToken
    ) {
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
          let changed =
            false;

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
| Moves the complete Gmail thread to Gmail Trash.
|
| This is intentionally NOT using threads.delete().
| The CRM delete action should remove the email from
| the Inbox while keeping it recoverable in Gmail Trash.
|
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
| Send Initial Auto Reply
|--------------------------------------------------------------------------
*/

const sendGmailAutoReply = async ({
  conversation,
  senderEmail,
  senderName,
  messageId,
  references,
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
    | Send Auto Reply
    |--------------------------------------------------------------------------
    */

    const result =
      await sendInitialAutoReply({
        customerEmail:
          senderEmail,

        customerName:
          senderName || '',

        conversationId:
          conversation._id,

        inReplyTo:
          messageId || '',

        references:
          references ||
          messageId ||
          '',
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
      result?.providerMessageId
    ) {
      conversation.latestResendEmailId =
        result.providerMessageId;
    }

    await conversation.save();

    console.log(
      `Automatic reply sent successfully to ${senderEmail}`
    );

    return {
      success: true,

      skipped: false,

      providerMessageId:
        result?.providerMessageId ||
        result?.messageId ||
        '',

      messageId:
        result?.data?._id ||
        null,
    };
  } catch (error) {
    console.error(
      `Automatic reply failed for ${senderEmail}:`,
      error
    );

    /*
    |--------------------------------------------------------------------------
    | Do Not Stop Gmail Sync
    |--------------------------------------------------------------------------
    */

    return {
      success: false,

      skipped: false,

      error:
        error.message ||
        'Automatic reply failed.',
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
    const messageId =
      gmailMessage?.id || '';

    const threadId =
      gmailMessage?.threadId || '';

    if (!messageId) {
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
              messageId,
          },
          {
            messageId,
          },
        ],
      });

    if (existingMessage) {
      return {
        success: true,

        skipped: true,

        reason:
          'Message already exists.',

        messageId,
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

        messageId,
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

        messageId,
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

          /*
          |--------------------------------------------------------------------------
          | Gmail Thread ID
          |--------------------------------------------------------------------------
          */

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

      /*
      |--------------------------------------------------------------------------
      | Save Gmail Thread ID
      |--------------------------------------------------------------------------
      */

      if (
        threadId &&
        !conversation.gmailThreadId
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
        |--------------------------------------------------------------------------
        | RFC Message ID
        |--------------------------------------------------------------------------
        */

        messageId,

        /*
        |--------------------------------------------------------------------------
        | Gmail IDs
        |--------------------------------------------------------------------------
        */

        gmailMessageId:
          messageId,

        gmailThreadId:
          threadId,

        inReplyTo,

        references,

        providerMessageId:
          messageId,

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
      messageId;

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
    |
    | Only send this when this is the first email from this customer.
    |
    */

    let autoReply = null;

    if (isNewConversation) {
      autoReply =
        await sendGmailAutoReply({
          conversation,

          senderEmail,

          senderName,

          messageId,

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

      gmailMessageId:
        messageId,

      gmailThreadId:
        threadId,

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
      | IMPORTANT:
      | Only INBOX messages are synchronized.
      |
      | When a thread is moved to Gmail Trash,
      | it is removed from INBOX and therefore
      | will not come back into the CRM on refresh.
      |
      */

      const response =
        await gmail.users.messages.list(
          {
            userId: 'me',

            labelIds: [
              'INBOX',
            ],

            maxResults: 50,
          }
        );

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
                `Automatic reply sent to ${result.customerEmail}`
              );
            }

            if (
              result.autoReplyError
            ) {
              console.error(
                `Automatic reply error for ${result.customerEmail}: ${result.autoReplyError}`
              );
            }
          }
        } catch (messageError) {
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

  syncGmailInbox,

  processGmailMessage,
};