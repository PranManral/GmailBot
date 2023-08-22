const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const cron = require('node-cron');

// Load environment variables from .env file
dotenv.config();

// Create an Express app
const app = express();

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Configure Gmail API client
const gmail = google.gmail({
  version: 'v1',
  auth: oauth2Client
});

// Function to create the "bali" label if it doesn't exist
const createBaliLabel = async () => {
  try {
    // Check if the "bali" label already exists
    const { data: labels } = await gmail.users.labels.list({ userId: 'me' });
    const labelExists = labels.labels.some(label => label.name === 'bali');
  
    if (!labelExists) {
      // Create the "bali" label
      await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
          name: 'bali'
        }
      });

      console.log('Created "bali" label');
    }else{
      console.log("label bali exisits");
    }
  } catch (error) {
    console.error('Error creating "bali" label:', error);
  }
};

// Define the login route
app.get('/auth/google', (req, res) => {
  // Generate the URL for Google OAuth consent screen
  const authUrl = oauth2Client.generateAuthUrl({
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify']
  });
  console.log('Using GMAIL_USER:', process.env.GMAIL_USER);
  // Redirect the user to the Google OAuth consent screen
  res.redirect(authUrl);
});

// Define the callback route for handling the authorization code
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  console.log('Using GMAIL_USER:', process.env.GMAIL_USER);
  try {
    // Exchange the authorization code for access and refresh tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Redirect the user to a success page
    res.send('Authentication successful!');
  } catch (error) {
    console.error('Error exchanging authorization code:', error);
    // Redirect the user to an error page
    res.send('Error occurred during authentication.');
  }
});

// Schedule the email checking and processing at random intervals
cron.schedule('*/45 * * * * *', async () => {
  console.log('Checking emails...');
  try {
    // Ensure the user is authenticated before proceeding
    if (oauth2Client.credentials) {
      await createBaliLabel();
      
      // Check for new emails and process them
      const messages = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread -from:me'
      });

      const emails = messages.data.messages;
      if (emails.length > 0) {
        console.log("found unread email!");
        for (const email of emails) {
          // Get the message details
          const message = await gmail.users.messages.get({
            userId: 'me',
            id: email.id
          });

          // Check if the thread has been replied
          const threadId = message.data.threadId;
          const thread = await gmail.users.threads.get({
            userId: 'me',
            id: threadId
          });
          const threadEmails = thread.data.messages;
          const isThreadReplied = threadEmails.some(threadEmail => threadEmail.labelIds.includes('SENT'));

          if (!isThreadReplied) {
            console.log("This email is not replied!! let's reply it with our message.");
            // Send an automatic reply
            const from = threadEmails[0].payload.headers.find(header => header.name === 'From').value;
            const subject = threadEmails[0].payload.headers.find(header => header.name === 'Subject').value;
            const rawReply = `From: me\r\nTo: ${from}\r\nSubject: Re: ${subject}\r\n\r\nI am in Bali, ttyl.`;
            const encodedRawReply = Buffer.from(rawReply).toString('base64');

            await gmail.users.messages.send({
              userId: 'me',
              requestBody: {
                raw: encodedRawReply
              }
            });

            console.log("We have now replied to the sender with our customed message.");

            // Retrieve the label IDs for 'bali' and 'UNREAD'
            const { data: labels } = await gmail.users.labels.list({ userId: 'me' });
            const baliLabelId = labels.labels.find(label => label.name === 'bali').id;
            const unreadLabelId = labels.labels.find(label => label.name === 'UNREAD').id;

            // Add the "bali" label to the email and mark it as read
            await gmail.users.messages.modify({
              userId: 'me',
              id: email.id,
              requestBody: {
                addLabelIds: [baliLabelId],
                removeLabelIds: [unreadLabelId]
              }
            });

            console.log("Replied email is marked as read and labelled with 'bali'.");
          }
        }
      }
    } 

  } catch (error) {
    console.error('Error checking emails:', error);
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
