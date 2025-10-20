# Discord Scraper

Full-stack Discord channel scraper with thread reconstruction, built following the enterprise architecture pattern.

## Features

- 📥 Scrape full message history from Discord channels
- 🧵 Thread reconstruction via reply-chain analysis
- 📊 Web dashboard for monitoring and browsing
- 🔄 Incremental scraping (capture only new messages)
- ⏯️  Resume interrupted scrapes
- 🗃️  SQLite database for portable storage
- 🔐 Secure authentication via cookie persistence

## Architecture

Built using the enterprise architecture pattern with:
- **Infrastructure Tier**: Shared packages (@myorg/api-server, @myorg/dashboard-ui)
- **Domain Tier**: Feature-oriented organization (scrape-engine, metadata-capture, thread-reconstruction)

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

```bash
# Install dependencies
npm install --legacy-peer-deps

# Initialize database
npm run init-db

# Set up Discord authentication
npm run auth-setup
```

## Configuration

Edit `discord-config.yaml` to define servers and channels to scrape:

```yaml
auth:
  cookies_file: "./cookies.json"

scraping:
  headless: true
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

servers:
  - id: "YOUR_SERVER_ID"
    name: "Server Name"
    channels:
      - id: "YOUR_CHANNEL_ID"
        name: "channel-name"
```

Validate configuration:
```bash
npm run validate-config
```

## Usage

### Start API + Dashboard

```bash
npm run dev
```

Access dashboard at: http://localhost:3001

### API Endpoints

**Servers:**
- `GET /api/servers` - List all configured servers
- `GET /api/servers/:id/channels` - Get channels for server

**Messages:**
- `GET /api/messages/:channelId?limit=50&offset=0` - Get messages with pagination

**Threads:**
- `GET /api/threads/:messageId` - Get conversation thread tree

**Scraping:**
- `POST /api/scrape/start` - Start scrape job
  ```json
  { "channel_id": "123", "scrape_type": "full" }
  ```
- `GET /api/scrape/status/:jobId` - Get job status
- `GET /api/scrape/jobs?status=running` - List jobs
- `POST /api/scrape/resume/:jobId` - Resume interrupted job

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build TypeScript
npm run build

# Build and watch
npm run build:watch
```

## Project Structure

```
src/
├── domain/              # Core business logic
│   ├── scrape-engine/  # Playwright automation
│   ├── metadata-capture/  # Data extraction
│   ├── thread-reconstruction/  # Conversation trees
│   └── models/         # TypeScript types
├── api/                # REST API routes
├── frontend/           # React dashboard
├── services/           # Database service
├── config/             # Config loader
└── cli/                # Command-line tools
```

## Testing

- **Unit tests**: Domain logic, parsers, analyzers
- **Integration tests**: API routes with test database
- **E2E tests**: Full scraping workflow

## License

MIT
