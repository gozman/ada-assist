const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const Client = require('@replit/database');
require('dotenv').config();

const app = express();
const db = new Client();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from a 'public' directory
app.use(express.static('public'));

// Configuration
const SUNSHINE_APP_ID = process.env.SUNSHINE_APP_ID;
const SUNSHINE_KEY_ID = process.env.SUNSHINE_KEY_ID;
const SUNSHINE_SECRET = process.env.SUNSHINE_SECRET;

console.log('Config:', { SUNSHINE_APP_ID, SUNSHINE_KEY_ID, SUNSHINE_SECRET });

// Helper function to create hash
function createHash(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

// Helper function to get config from database
async function getConfig(hashedId) {
  try {
    const config = await db.get(hashedId);
    if (!config) {
      throw new Error('Configuration not found');
    }
    return config;
  } catch (error) {
    console.error('Error getting config:', error);
    throw error;
  }
}

// Serve the HTML form
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

// Handle form submission
app.post('/setup', async (req, res) => {
  try {
    const { suncoAppId, suncoKeyId, suncoSecret, adaInstanceName } = req.body;
    
    // Generate GUID and hash it
    const guid = uuidv4();
    const hashedGuid = createHash(guid);
    
    // Create configuration object
    const config = {
      suncoAppId,
      suncoKeyId,
      suncoSecret,
      adaInstanceName,
      createdAt: new Date().toISOString()
    };

    // Store in Replit Database
    await db.set(hashedGuid, config);
    
    res.json({
      success: true,
      hashedId: hashedGuid,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    console.error('Error in setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save configuration'
    });
  }
});

// Send message with config lookup
app.post('/api/messages', async (req, res) => {
  console.log('Received message request:', req.body);
  try {
    const { ticketId, customerMessage, hashedId } = req.body;
    
    // Get configuration using hashedId
    const config = await getConfig(hashedId);
    
    // Get or create appUser using config credentials
    const appUserId = await getOrCreateAppUser(ticketId, config);

    console.log('Sending message:', { appUserId, customerMessage });
    const response = await axios.post(
      `https://api.smooch.io/v1.1/apps/${config.suncoAppId}/appusers/${appUserId}/messages`,
      {
        role: 'appUser',
        type: 'text',
        text: customerMessage
      },
      {
        auth: {
          username: config.suncoKeyId,
          password: config.suncoSecret
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

// Get messages with config lookup
app.get('/api/messages', async (req, res) => {
  console.log('Received get messages request:', req.query);
  try {
    const { ticketId, hashedId } = req.query;
    
    // Get configuration using hashedId
    const config = await getConfig(hashedId);
    
    // Get or create appUser using config credentials
    const appUserId = await getOrCreateAppUser(ticketId, config);

    console.log('Fetching messages:', { appUserId });
    const response = await axios.get(
      `https://api.smooch.io/v1.1/apps/${config.suncoAppId}/appusers/${appUserId}/messages`,
      {
        auth: {
          username: config.suncoKeyId,
          password: config.suncoSecret
        }
      }
    );

    const messages = response.data.messages;
    const latestMessage = messages[messages.length - 1];

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

// Updated getOrCreateAppUser to use config
async function getOrCreateAppUser(ticketId, config) {
  const externalId = hashTicketId(ticketId);
  console.log('Getting/Creating appUser for:', { ticketId, externalId });
  
  try {
    // First try to get existing appUser
    try {
      console.log('Attempting to get existing appUser:', { externalId });
      const getResponse = await axios.get(
        `https://api.smooch.io/v1.1/apps/${config.suncoAppId}/appusers/${externalId}`,
        {
          auth: {
            username: config.suncoKeyId,
            password: config.suncoSecret
          }
        }
      );
      
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
      `https://api.smooch.io/v1.1/apps/${config.suncoAppId}/appusers`,
      {
        "userId": externalId
      },
      {
        auth: {
          username: config.suncoKeyId,
          password: config.suncoSecret
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

// Helper function to create hash of ticket ID
function hashTicketId(ticketId) {
  const hash = crypto.createHash('md5').update(`ticket-${ticketId}`).digest('hex');
  console.log('Generated hash for ticket:', { ticketId, hash });
  return hash;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 