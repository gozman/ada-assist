# Ada Agent Assist

Ada Agent Assist is a Zendesk Sidebar App that allows agents to generate responses to customer messages using Ada's AI Agent.

### What it does:

* When a customer sends a new message, the app automatically generates a suggested response
* The suggested response is displayed in the sidebar with two options:
  * "Use Response" - Inserts the suggestion into the ticket reply editor
  * "Generate New Response" - Requests a new suggested response
* If the last message is from an agent rather than a customer, the app shows:
  * An explanation that auto-generation happens after customer messages
  * A "Generate Response" button to manually request a suggestion
* The app processes the full ticket conversation history to generate contextually relevant responses
* Responses are formatted with Markdown for improved readability
