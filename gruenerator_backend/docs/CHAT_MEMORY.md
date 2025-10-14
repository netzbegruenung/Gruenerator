# Chat Memory System

## Overview

The Grünerator Chat now includes a Redis-based short-term memory system that provides conversation context to improve AI responses. This implementation follows LangGraph patterns for thread-based conversation state management.

## Architecture

### Parallel Memory Design
- **Frontend**: Continues using localStorage for UI state (no changes required)
- **Backend**: Redis storage for AI context (new implementation)
- **No synchronization needed**: Each serves different purposes

### Key Components

#### 1. Chat Memory Service (`services/chatMemoryService.js`)
- Stores last 20 messages per user
- 24-hour TTL (auto-expiry)
- Redis-based with error handling
- Automatic message trimming

#### 2. Token Counter (`utils/tokenCounter.js`)
- Estimates token usage (1 token ≈ 4 characters)
- Smart message trimming for context windows
- Keeps conversations under 6000 tokens for AI processing

#### 3. Enhanced Chat Router (`routes/chat/grueneratorChat.js`)
- Retrieves conversation history for each request
- Passes context to intent classifier
- Stores responses automatically
- Uses response wrapper to capture outputs

#### 4. Context-Aware Intent Classifier (`agents/chat/intentClassifier.js`)
- Uses last 5 messages for better classification
- Improves handling of contextual requests like "make that a sharepic"
- Maintains conversation flow awareness

#### 5. Logout Cleanup (`routes/auth/authCore.mjs`)
- Clears chat memory on user logout
- Handles both GET and POST logout routes
- Privacy-friendly memory management

## Data Structure

### Redis Key Format
```
Key: chat:{userId}
TTL: 86400 seconds (24 hours)
```

### Message Object
```javascript
{
  "messages": [
    {
      "role": "user",
      "content": "Create a social media post about climate",
      "timestamp": 1234567890
    },
    {
      "role": "assistant",
      "content": "Here's your climate post...",
      "agent": "social_media",
      "timestamp": 1234567891
    }
  ],
  "metadata": {
    "lastAgent": "social_media",
    "lastUpdated": 1234567891,
    "messageCount": 2
  }
}
```

## Benefits

✅ **Context-Aware Conversations**: AI sees previous messages for better responses
✅ **No Frontend Changes**: Existing chatStore.js works unchanged
✅ **Fast Performance**: Redis in-memory operations
✅ **Auto-Cleanup**: TTL and logout cleanup prevent memory leaks
✅ **Privacy-Friendly**: Data expires automatically
✅ **Robust**: Handles Redis failures gracefully

## Usage Examples

### Conversation Flow
```
User: "Create a social media post about renewable energy"
AI: [Generates post with social_media agent]

User: "Make that shorter"
AI: [Sees previous post in context, shortens it]

User: "Now turn it into a sharepic"
AI: [Converts to sharepic format using conversation context]
```

### API Integration
The memory system works automatically with existing chat endpoints:

```javascript
POST /api/chat
{
  "message": "Make that into a quote",
  "context": {} // Enhanced automatically with conversation history
}
```

## Monitoring

### Redis Memory Usage
```bash
# Check stored conversations
redis-cli KEYS "chat:*"

# View conversation data
redis-cli GET "chat:user-123"

# Check TTL
redis-cli TTL "chat:user-123"
```

### Conversation Stats
```javascript
const stats = await chatMemory.getConversationStats(userId);
console.log(stats);
// {
//   userId: "user-123",
//   messageCount: 15,
//   lastAgent: "social_media",
//   lastUpdated: 1234567890,
//   expiresIn: 82800
// }
```

## Testing

Run the integration test suite:

```bash
cd gruenerator_backend
node test/chatMemoryTest.js
```

The test covers:
- Redis connectivity
- Message storage/retrieval
- Token counting and trimming
- Memory cleanup
- Edge case handling

## Configuration

### Environment Variables
```bash
REDIS_URL=redis://localhost:6379  # Required
```

### Memory Limits
- **Max Messages**: 20 per conversation (configurable in chatMemoryService.js)
- **Context Window**: 6000 tokens (configurable in grueneratorChat.js)
- **TTL**: 24 hours (configurable in chatMemoryService.js)

## Error Handling

The system is designed to fail gracefully:
- If Redis is down, chat still works without context
- Invalid parameters are logged and ignored
- Token overflow is prevented by automatic trimming
- Memory cleanup errors don't block logout

## Performance

- **Storage**: ~1KB per message average
- **Retrieval**: <1ms for conversation history
- **Memory**: Auto-trimmed to prevent growth
- **Cleanup**: Automatic via TTL and logout