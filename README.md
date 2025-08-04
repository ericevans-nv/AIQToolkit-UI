# AIQ Toolkit - UI

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![AIQ Toolkit](https://img.shields.io/badge/AIQToolkit-Frontend-green)](https://github.com/NVIDIA/AIQToolkit/tree/main)

This is the official frontend user interface component for [AIQ Toolkit](https://github.com/NVIDIA/AIQToolkit/tree/main), an open-source library for building AI agents and workflows.

This project builds upon the work of:
- [chatbot-ui](https://github.com/mckaywrigley/chatbot-ui) by Mckay Wrigley
- [chatbot-ollama](https://github.com/ivanfioravanti/chatbot-ollama) by Ivan Fioravanti

## Features
- 🎨 Modern and responsive user interface
- 🔄 Real-time streaming responses
- 🤝 Human-in-the-loop workflow support
- 🌙 Light/Dark theme
- 🔌 WebSocket and HTTP API integration
- 🐳 Docker support

## Getting Started

### Prerequisites
- [AIQ Toolkit](https://github.com/NVIDIA/AIQToolkit/tree/main) installed and configured
- Git
- Node.js (v18 or higher)
- npm or Docker

### Installation

Clone the repository:
```bash
git clone git@github.com:NVIDIA/AIQToolkit.git
cd AIQToolkit
```

Install dependencies:
```bash
npm ci
```

### Running the Application

#### Local Development
```bash
npm run dev
```
The application will be available at `http://localhost:3000`

#### Docker Deployment
```bash
# Build the Docker image
docker build -t aiqtoolkit-ui .

# Run the container with environment variables from .env
# Ensure the .env file is present before running this command.
# Skip --env-file .env if no overrides are needed.
docker run --env-file .env -p 3000:3000 aiqtoolkit-ui
```

![AIQ Toolkit Web User Interface](public/screenshots/ui_home_page.png)

## Configuration

### HTTP API Connection
Settings can be configured by selecting the `Settings` icon located on the bottom left corner of the home page.

![AIQ Toolkit Web UI Settings](public/screenshots/ui_generate_example_settings.png)

### Settings Options
NOTE: Most of the time, you will want to select /chat/stream for intermediate results streaming.

- `Theme`: Light or Dark Theme
- `HTTP URL for Chat Completion`: REST API endpoint
  - /generate - Single response generation
  - /generate/stream - Streaming response generation
  - /chat - Single response chat completion
  - /chat/stream - Streaming chat completion
- `WebSocket URL for Completion`: WebSocket URL to connect to running AIQ Toolkit server
- `WebSocket Schema`: Workflow schema type over WebSocket connection

## Usage Examples

### Simple Calculator Example

#### Setup and Configuration
1. Set up [AIQ Toolkit Get Started ](https://github.com/NVIDIA/AIQToolkit/blob/main/docs/source/intro/get-started.md)
2. Start workflow by following the [Simple Calculator Example](https://github.com/NVIDIA/AIQToolkit/blob/main/examples/simple_calculator/README.md)
```bash
aiq serve --config_file=examples/simple_calculator/configs/config.yml
```

#### Testing the Calculator
Interact with the chat interface by prompting the agent with the message:
```
Is 4 + 4 greater than the current hour of the day?
```

![AIQ Toolkit Web UI Workflow Result](public/screenshots/ui_generate_example.png)

### Human In The Loop (HITL) Example

#### Setup and Configuration
1. Set up [AIQ Toolkit](https://github.com/NVIDIA/AIQ Toolkit/blob/main/docs/source/1_intro/getting_started.md) 
2. Start workflow by following the [HITL Example](https://github.com/NVIDIA/AIQ Toolkit/blob/main/examples/simple_human_in_the_loop/README.md)
```bash
aiq serve --config_file=examples/simple_human_in_the_loop/configs/config.yml
```

#### Configuring HITL Settings
Enable WebSocket mode in the settings panel for bidirectional real-time communication between the client and server.

![AIQ Toolkit Web UI HITL Settings](public/screenshots/hitl_settings.png)

#### Example Conversation
1. Send the following prompt:
```
Can you process my input and display the result for the given prompt: How are you today?
```

2. Enter your response when prompted:

![AIQ Toolkit Web UI HITL Prompt](public/screenshots/hitl_prompt.png)

3. Monitor the result:

![AIQ Toolkit Web UI HITL Prompt](public/screenshots/hitl_result.png)

## Data Management

### Import and Export
The application includes built-in data management features to backup and restore your conversations, folders, and prompts.

#### Export Data
- **Location**: Click the "Export data" button in the sidebar settings (bottom left corner)
- **Functionality**: Downloads all your conversations, folder organization, and saved prompts as a JSON file
- **File format**: `chatbot_ui_history_MM-DD.json` (where MM-DD is the current month-day)

#### Import Data
- **Location**: Click the "Import data" button in the sidebar settings (bottom left corner) 
- **Functionality**: Restore conversations, folders, and prompts from a previously exported JSON file
- **File format**: Accepts `.json` files exported from this application
- **Process**: Select your backup file → data is automatically loaded → page refreshes to show imported content
> **Note**: Importing data will replace your current conversations and settings. Export your current data first if you want to keep it.

## API Integration

### Server Communication
The UI supports both HTTP requests (OpenAI compatible) and WebSocket connections for server communication. For detailed information about WebSocket messaging integration, please refer to the [WebSocket Documentation](https://github.com/NVIDIA/AIQToolkit/blob/main/docs/source/references/websockets.md) in the AIQ Toolkit documentation.



## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. The project includes code from [chatbot-ui](https://github.com/mckaywrigley/chatbot-ui) and [chatbot-ollama](https://github.com/ivanfioravanti/chatbot-ollama), which are also MIT licensed.

