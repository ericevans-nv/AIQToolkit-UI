# NeMo Agent Toolkit UI Documentation

## Overview
This directory contains comprehensive documentation for the NeMo Agent Toolkit UI, a React/Next.js application that provides a modern chat interface for AI agent interactions.

## Documentation Structure

### Feature Documentation
- **[Chat Interface](./chat/chat-interface.md)** - Real-time conversational interface with streaming and voice input
- **[Sidebar Navigation](./sidebar/conversation-management.md)** - Conversation organization, search, and folder management
- **[Configuration Management](./settings/configuration-management.md)** - API configuration, import/export, and application settings
- **[Button Reference](./button-reference.md)** - Comprehensive guide to all interactive buttons in the UI

### Component Documentation
Each component directory contains a README.md with detailed behavior and integration information:

- **[Chat Components](../../components/Chat/README.md)** - Core chat functionality and message handling
- **[Chatbar Components](../../components/Chatbar/README.md)** - Conversation management and organization
- **[Sidebar Components](../../components/Sidebar/README.md)** - Generic sidebar layout and controls
- **[Folder Components](../../components/Folder/README.md)** - Collapsible organization containers

## Key Features
- **Real-time Chat Streaming** via WebSocket connections
- **Human-in-the-Loop Workflows** with interactive modals
- **Conversation Organization** with folders and search
- **Data Import/Export** for conversation backup
- **Dark/Light Theme** support

## Tech Stack
- **Framework:** Next.js 13+ with React 18
- **Language:** TypeScript for type safety
- **Styling:** Tailwind CSS for responsive design
- **State:** React Context + useReducer pattern
- **Real-time:** WebSocket for streaming responses
- **Markdown:** react-markdown with custom components
- **Charts:** Recharts for data visualization
- **Icons:** Tabler Icons for consistent iconography
- **i18n:** next-i18next for internationalization