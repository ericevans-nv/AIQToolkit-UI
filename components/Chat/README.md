# Chat Components

This directory contains all components related to the chat interface functionality.

## Components Overview

### Core Chat Components
- **Chat.tsx** - Main chat container and message orchestration
- **ChatInput.tsx** - Message input with voice features  
- **ChatMessage.tsx** - Individual message display and interactions
- **ChatHeader.tsx** - Chat header with conversation title and actions
- **ChatLoader.tsx** - Loading state indicator during message processing

### Specialized Components  
- **ChatInteractionMessage.tsx** - Human-in-the-loop interaction modal
- **MemoizedChatMessage.tsx** - Performance-optimized message wrapper
- **ErrorMessageDiv.tsx** - Error message display component
- **Regenerate.tsx** - Message regeneration functionality

## Behavior

**Real-time Streaming:**
- WebSocket connection handles live message updates
- Messages stream character-by-character for natural conversation flow
- Loading states show when assistant is processing
- Stop button allows canceling ongoing responses

**Message Management:**
- Messages support editing, deletion, and regeneration
- Conversation history persists across sessions
- Copy functionality for sharing message content
- Text-to-speech playback for accessibility

**Human-in-the-Loop:**
- Interactive modals for user approval workflows
- OAuth consent handling with automatic redirects
- Workflow pause/resume based on user input
- Context preservation during interactions

## Key Features
- Real-time WebSocket message streaming
- Human-in-the-loop workflow support
- Markdown rendering with syntax highlighting
- Responsive design for mobile and desktop

## Related Documentation
See [docs/ui/chat/chat-interface.md](../../docs/ui/chat/chat-interface.md) for detailed feature documentation.