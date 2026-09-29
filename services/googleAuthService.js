const { google } = require("googleapis");

const getOAuth2Client = () => {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    throw new Error(
      "Google OAuth client credentials are not configured."
    );
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:5000/api/emails/google/callback"
  );
};

const getGoogleAuthUrl = () => {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  });
};

const getGoogleTokens = async (code) => {
  const oauth2Client = getOAuth2Client();

  const { tokens } =
    await oauth2Client.getToken(code);

  return tokens;
};

module.exports = {
  getOAuth2Client,
  getGoogleAuthUrl,
  getGoogleTokens,
};