const API_BASE_URL = 'https://277e7130-e6bc-47bb-a8c4-7c1a6f0e3aae-00-tfy4lvq9brpf.picard.replit.dev/api';

// Get hashedId from app metadata
async function getHashedId() {
  const metadata = await client.metadata();
  const hashedId = metadata.settings.hashedId;
  if (!hashedId) {
    throw new Error('Configuration ID not found. Please complete setup first.');
  }
  return hashedId;
}

async function sendMessage(ticketId, conversation) {
  try {
    const hashedId = await getHashedId();
    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ticketId,
        customerMessage: conversation,
        hashedId
      })
    });
    const data = await response.json();
    return data.messageId;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

async function getMessages(ticketId, afterMessageId = null) {
  try {
    const hashedId = await getHashedId();
    const url = new URL(`${API_BASE_URL}/messages`);
    url.searchParams.append('ticketId', ticketId);
    url.searchParams.append('hashedId', hashedId);
    if (afterMessageId) {
      url.searchParams.append('after', afterMessageId);
    }
    
    const response = await fetch(url.toString());
    const data = await response.json();
    return data.messages;
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
}

async function updateTicketComment(suggestion) {
  try {
    await client.invoke('ticket.editor.insert', suggestion);
  } catch (error) {
    console.error('Error updating ticket:', error);
    throw error;
  }
}

// Helper function to check if last message is from user
async function isLastMessageFromUser() {
  try {
    const ticketConvo = await client.get("ticket.conversation");
    const messages = ticketConvo["ticket.conversation"] || [];
    if (messages.length === 0) return false;
    
    const lastMessage = messages[messages.length - 1];
    return lastMessage.author.role === 'end-user';
  } catch (error) {
    console.error('Error checking last message:', error);
    return false;
  }
}

// Add this function at the top level
function resizeToFit() {
  const container = document.querySelector('#responseContainer');
  const height = container.scrollHeight;
  client.invoke('resize', { width: '320px', height: `${height + 32}px` }); // 32px for padding
}

// Modify showGenerateButton to include resize
function showGenerateButton() {
  const responseContainer = document.querySelector('#responseContainer');
  responseContainer.innerHTML = `
    <div class="u-mb-lg">
      <p class="u-fs-sm u-color-secondary">
        This app automatically generates response suggestions when a customer sends a message. 
      </p>
      <br/>
      <p class="u-fs-sm u-color-secondary">
        Since the last message in the conversation is not from a customer, you'll need to wait for a new message or click the button below to suggest a further reply.
      </p>
    </div>
    <button id="generateResponse" class="c-btn c-btn--primary c-btn--md c-btn--full">
      Generate Response
    </button>
  `;

  document.getElementById('generateResponse').addEventListener('click', async () => {
    const data = await client.get('ticket');
    const ticketId = data.ticket.id;
    await handleNewMessage(ticketId);
  });
  
  resizeToFit();
}

// Modify renderSuggestion to include resize
function renderSuggestion(suggestion) {
  const responseContainer = document.querySelector('#responseContainer');
  responseContainer.innerHTML = `
    <div class="u-mb-sm">
      <h3 class="u-semibold u-fs-lg">Suggested Response</h3>
      <div class="u-mt-sm u-mb-sm markdown-content">
        ${marked.parse(suggestion)}
      </div>
      <div class="u-gap-sm">
        <button id="useResponse" class="c-btn c-btn--primary c-btn--md c-btn--full">
          Use Response
        </button>
        <button id="generateNewResponse" class="c-btn c-btn--basic c-btn--md c-btn--full">
          Generate New Response
        </button>
      </div>
    </div>
  `;

  document.getElementById('useResponse').addEventListener('click', async () => {
    await updateTicketComment(suggestion);
    showGenerateButton();
  });

  document.getElementById('generateNewResponse').addEventListener('click', async () => {
    const data = await client.get('ticket');
    const ticketId = data.ticket.id;
    await handleNewMessage(ticketId);
  });
  
  resizeToFit();
}

// Modify waitForAdaResponse to include resize
async function waitForAdaResponse(ticketId) {
  let attempts = 0;
  const maxAttempts = 60;
  
  const container = document.querySelector('#responseContainer');
  container.innerHTML = `
    <div class="u-mb-sm">
      <h3 class="u-semibold u-fs-lg u-ta-center">Thinking...</h3>
      <span class="u-mt-xl u-mb-lg u-ta-center loader"></span>
    </div>
  `;
  
  resizeToFit();

  return new Promise((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        const hashedId = await getHashedId();
        const response = await fetch(`${API_BASE_URL}/messages?ticketId=${ticketId}&hashedId=${hashedId}`);
        const data = await response.json();
        
        // Access the latest message
        const adaResponse = data.latestMessage;
        
        if (adaResponse && adaResponse.role === 'appMaker') {
          clearInterval(pollInterval);
          resolve(adaResponse.text);
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(new Error('Timeout waiting for Ada response'));
        }
      } catch (error) {
        clearInterval(pollInterval);
        reject(error);
      }
    }, 2000); // Poll every 5 seconds
  });
}

async function handleNewMessage(ticketId) {
  try {
    const conversationText = await getTicketConversation();
    const messageId = await sendMessage(ticketId, conversationText);
    const suggestion = await waitForAdaResponse(ticketId);
    renderSuggestion(suggestion);
  } catch (error) {
    console.error('Error handling new message:', error);
    const container = document.querySelector('#responseContainer');
    if (error.message.includes('Configuration ID not found')) {
      container.innerHTML = `
        <div class="c-alert c-alert--error u-mb-sm">
          ${error.message}
        </div>
        <a href="${API_BASE_URL}/setup" target="_blank" class="c-btn c-btn--primary c-btn--md c-btn--full">
          Complete Setup
        </a>
      `;
    } else {
      container.innerHTML = `
        <div class="c-alert c-alert--error u-mb-sm">
          Failed to get Ada's suggestion. Please try again.
        </div>
        <button id="generateResponse" class="c-btn c-btn--primary c-btn--md c-btn--full">
          Generate Response
        </button>
      `;
    }
    resizeToFit();
  }
}

// Add this helper function to strip HTML tags
function stripHtml(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

async function getTicketConversation() {
  try {
    const ticketConvo = await client.get("ticket.conversation");
    const messages = ticketConvo["ticket.conversation"] || [];
    
    // Format messages into a human-readable conversation string
    const conversationText = messages
      .map(msg => {
        const role = msg.author.role === 'end-user' ? 'Customer' : 'Agent';
        const content = msg.message.content || '';
        
        // Strip HTML if present
        const temp = document.createElement('div');
        temp.innerHTML = content;
        const cleanContent = temp.textContent || temp.innerText || '';
        
        return `${msg.author.name} (${role}): ${cleanContent}`;
      })
      .join('\n');

    return conversationText;
  } catch (error) {
    console.error('Error getting ticket conversation:', error);
    throw error;
  }
}

// Add resize observer to handle dynamic content changes
const resizeObserver = new ResizeObserver(() => {
  resizeToFit();
});

// Initialize the app with resize handling
client.on('app.registered', async function() {
  try {
    const data = await client.get('ticket');
    const ticketId = data.ticket.id;
    
    // Start observing the container for size changes
    const container = document.querySelector('#responseContainer');
    resizeObserver.observe(container);
    
    if (await isLastMessageFromUser()) {
      await handleNewMessage(ticketId);
    } else {
      showGenerateButton();
    }
  } catch (error) {
    console.error('Error initializing app:', error);
  }
});

// Handle ticket updates
client.on('ticket.conversation.changed', async function() {
  try {
    const data = await client.get('ticket');
    const ticketId = data.ticket.id;
    
    if (await isLastMessageFromUser()) {
      // Auto-generate response if new message is from user
      await handleNewMessage(ticketId);
    } else {
      // Show generate button if last message is from agent
      showGenerateButton();
    }
  } catch (error) {
    console.error('Error handling ticket update:', error);
  }
}); 