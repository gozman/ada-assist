const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const SUNSHINE_APP_ID = process.env.SUNSHINE_APP_ID;
const SUNSHINE_KEY_ID = process.env.SUNSHINE_KEY_ID;
const SUNSHINE_SECRET = process.env.SUNSHINE_SECRET;

console.log('Config:', { SUNSHINE_APP_ID, SUNSHINE_KEY_ID, SUNSHINE_SECRET });

// Helper function to create hash of ticket ID
function hashTicketId(ticketId) {
  const hash = crypto.createHash('md5').update(`ticket-${ticketId}`).digest('hex');
  console.log('Generated hash for ticket:', { ticketId, hash });
  return hash;
}

// Create or get appUser
async function getOrCreateAppUser(ticketId) {
  const externalId = hashTicketId(ticketId);
  console.log('Getting/Creating appUser for:', { ticketId, externalId });
  
  try {
    // First try to get existing appUser
    try {
      console.log('Attempting to get existing appUser:', { externalId });
      const getResponse = await axios.get(
        `https://api.smooch.io/v1.1/apps/${SUNSHINE_APP_ID}/appusers/${externalId}`,
        {
          auth: {
            username: SUNSHINE_KEY_ID,
            password: SUNSHINE_SECRET
          }
        }
      );
      
      console.log('Get appUser response:', getResponse.data);
      
      if (getResponse.data.appUser) {
        const appUserId = getResponse.data.appUser._id;
        console.log('Found existing appUser:', { externalId, appUserId });
        return appUserId;
      }
    } catch (error) {
      console.log('AppUser not found, will create new one:', { 
        error: error.response?.data || error.message 
      });
    }

    // If appUser not found, create new one
    console.log('Creating new appUser:', { externalId });
    const createResponse = await axios.post(
      `https://api.smooch.io/v1.1/apps/${SUNSHINE_APP_ID}/appusers`,
      {
        "userId":externalId
      },
      {
        auth: {
          username: SUNSHINE_KEY_ID,
          password: SUNSHINE_SECRET
        }
      }
    );
    
    const appUserId = createResponse.data.appUser._id;
    console.log('Created new appUser:', { externalId, appUserId });
    return appUserId;
  } catch (error) {
    console.error('Error in getOrCreateAppUser:', {
      error: error.response?.data || error.message,
      ticketId,
      externalId
    });
    throw error;
  }
}

// Send message
app.post('/api/messages', async (req, res) => {
  console.log('Received message request:', req.body);
  try {
    const { ticketId, customerMessage } = req.body;
    
    // Get or create appUser
    console.log('Getting appUser for message:', { ticketId });
    const appUserId = await getOrCreateAppUser(ticketId);
    console.log('Got appUser for message:', { appUserId });

    console.log('Sending message:', { appUserId, customerMessage });
    const response = await axios.post(
      `https://api.smooch.io/v1.1/apps/${SUNSHINE_APP_ID}/appusers/${appUserId}/messages`,
      {
        role: 'appUser',
        type: 'text',
        text: customerMessage
      },
      {
        auth: {
          username: SUNSHINE_KEY_ID,
          password: SUNSHINE_SECRET
        }
      }
    );

    console.log('Message sent successfully:', response.data);
    return res.json({ messageId: response.data.message._id });
  } catch (error) {
    console.error('Error sending message:', {
      error: error.response?.data || error.message,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get messages
app.get('/api/messages', async (req, res) => {
  console.log('Received get messages request:', req.query);
  try {
    const { ticketId } = req.query;
    console.log('Getting appUser for messages:', { ticketId });
    const appUserId = await getOrCreateAppUser(ticketId);
    console.log('Got appUser for messages:', { appUserId });

    console.log('Fetching messages:', { appUserId });
    const response = await axios.get(
      `https://api.smooch.io/v1.1/apps/${SUNSHINE_APP_ID}/appusers/${appUserId}/messages`,
      {
        auth: {
          username: SUNSHINE_KEY_ID,
          password: SUNSHINE_SECRET
        }
      }
    );

    // Assuming messages are sorted by date, get the latest one
    const messages = response.data.messages;
    const latestMessage = messages[messages.length - 1]; // Get the last message

    console.log('Latest message fetched successfully:', latestMessage);
    return res.json({ latestMessage });
  } catch (error) {
    console.error('Error getting messages:', {
      error: error.response?.data || error.message,
      query: req.query
    });
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 