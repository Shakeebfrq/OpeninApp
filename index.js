const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

const axios = require('axios');

const clientId = '134976763254-fcscqh9smfto4iapqinmiknsq6dcgivu.apps.googleusercontent.com';
const clientSecret = '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';
const redirectUri = 'http://localhost:3000/auth/callback';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.labels', 'https://www.googleapis.com/auth/gmail.modify'];

const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

// Function to refresh the access token
const refreshAccessToken = async () => {
  const { credentials } = await oAuth2Client.refreshToken(oAuth2Client.credentials.refresh_token);
  oAuth2Client.setCredentials(credentials);
};

    app.get('/auth', (req, res) => {
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
        });
        res.redirect(authUrl);
    });


app.get('/auth/callback', async (req, res) => {
    try
    {
        const { code } = req.query;
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);  
    
      // Get the user's email address
      const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
      const userInfo = await gmail.users.getProfile({ userId: 'me' });
      const userEmail = userInfo.data.emailAddress;
    
      // Check for unread emails
      const messages = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'],
        q: 'is:unread',
      });
    
      if (messages.data.messages) {
        // Loop through unread messages
        for (const message of messages.data.messages) {
          const messageDetails = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
          });
    
          // Check if the email thread has prior replies from your email address
          const threadId = messageDetails.data.threadId;
          const threadDetails = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
          });
    
          const hasRepliesFromYou = threadDetails.data.messages.some((threadMessage) => {
            return threadMessage.from && threadMessage.from.emailAddress && threadMessage.from.emailAddress === userEmail;
          });
    
          // If no prior replies,
          if (!hasRepliesFromYou) {
    
            // send a reply
            await sendReply(gmail, userEmail, threadId);
    
            // Tag the email with a label
            await tagEmailWithLabel(gmail, threadId, 'test');
          }
        }
      }
    
      res.send('Email threads checked.');
    }
    catch (error) {
        // Handle specific errors
        if (error.message.includes('invalid_grant')) {
          await refreshAccessToken();
          // Retry the previous logic after refreshing the token
        } else {
          console.error('Error during token exchange:', error.message);
          res.status(500).send('Internal Server Error');
        }
      }    
});

const sendReply = async (gmail, userEmail, threadId) => {
  const message = `Thank you for your email! This is an automated reply.`;

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      threadId: threadId,
      raw: Buffer.from(`From: ${userEmail}\r\nTo: ${userEmail}\r\nSubject: Re: Your Subject\r\n\r\n${message}`).toString('base64'),
    },
  });

  console.log('Reply sent.');
};

const tagEmailWithLabel = async (gmail, threadId, labelName) => {
        // Check if the label exists
  const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
  const labelExists = labelsResponse.data.labels.some((label) => label.name === labelName);
  console.log("labelexists" + labelExists);

  // If the label doesn't exist, create it
  if (!labelExists) {
    await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        messageListVisibility: 'show',
        labelListVisibility: 'labelShow',
      },
    });
  }

  const response = await gmail.users.labels.list({
    userId: 'me',
  });

  const newlabels = response.data.labels;
  const matchingLabel = newlabels.find((label) => label.name === labelName).id;

  // Tag the email with the label
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: {
      addLabelIds: [matchingLabel],
    },
  });

  console.log(`Email tagged with label: ${labelName}`);
  
};

// Function to make a request to the /auth/callback URL
async function hitAuthCallback() {
    try {
      const response = await axios.get('http://localhost:3000/auth/');
      console.log('Auth callback hit successfully:');
    } catch (error) {
      console.error('Error hitting auth callback:', error.message);
    }
  }
  
  // Function to repeat the hitting of /auth/callback at random intervals
  function repeatAuthCallback() {
    const minInterval = 45000; // 45 seconds
    const maxInterval = 120000; // 120 seconds
  
    setInterval(async () => {
      await hitAuthCallback();
    }, Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval);
  }
  
  // Start hitting the /auth/callback
  //repeatAuthCallback();

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
