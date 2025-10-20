# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Build TypeScript
npm run build

# Build and watch for changes
npm run build:watch

# Start API server + dashboard (dev mode)
npm run dev
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- <test-file-name>.test.ts

# Run with coverage
npm test -- --coverage
```

### Database Operations
```bash
# Initialize database with schema
npm run init-db

# Reset database (drops all tables and recreates schema)
npm run db:reset

# Backup database
npm run db:backup
```

### Configuration & Setup
```bash
# Validate discord-config.yaml structure
npm run validate-config

# Interactive Discord authentication setup (saves cookies to cookies.json)
npm run auth-setup
```

## Architecture

### Enterprise Pattern Structure

This codebase follows an **enterprise architecture pattern** with a clear separation between infrastructure and domain tiers:

**Infrastructure Tier**: Shared packages located in `../../packages/`
- `@myorg/api-server`: Express server setup with CORS, logging, and common middleware
- `@myorg/dashboard-ui`: React-based dashboard components

**Domain Tier**: Feature-oriented organization under `src/domain/`
- `scrape-engine/`: Playwright-based browser automation (DiscordBrowserController, MessageScroller)
- `metadata-capture/`: Message parsing and data extraction (MessageParser)
- `thread-reconstruction/`: Conversation tree analysis (ThreadAnalyzer)
- `models/`: TypeScript type definitions shared across domains

### Core Components

**DatabaseService** (`src/services/DatabaseService.ts`)
- Singleton wrapper around better-sqlite3
- Manages all database operations (CRUD for servers, channels, messages, scrape jobs)
- Uses prepared statements for performance
- Key methods: `insertMessage()`, `getReplies()`, `updateChannelAfterScrape()`
- Foreign keys enabled for data integrity

**DiscordBrowserController** (`src/domain/scrape-engine/DiscordBrowserController.ts`)
- Manages Playwright browser lifecycle
- Handles cookie-based authentication (loads/saves from `cookies.json`)
- Navigates to Discord channels via `https://discord.com/channels/{serverId}/{channelId}`
- Configurable headless mode

**MessageParser** (`src/domain/metadata-capture/MessageParser.ts`)
- Transforms raw Discord message data into typed Message objects
- Handles attachment URLs and embed data as JSON strings
- Validates and normalizes timestamps

**ThreadAnalyzer** (`src/domain/thread-reconstruction/ThreadAnalyzer.ts`)
- Reconstructs conversation trees from reply relationships
- Builds recursive MessageNode structures via `buildThreadTree()`
- Provides utilities: `getThreadDepth()`, `countThreadMessages()`, `flattenThread()`
- Uses DatabaseService to query reply chains

### Data Flow

1. **Configuration**: `discord-config.yaml` → ConfigLoader → DiscordConfig type
2. **Authentication**: User runs `npm run auth-setup` → cookies saved to `cookies.json`
3. **Scraping**:
   - API receives scrape request → creates ScrapeJob
   - DiscordBrowserController launches browser with cookies
   - MessageScroller extracts raw message data from DOM
   - MessageParser transforms to Message objects
   - DatabaseService stores messages with reply relationships
4. **Thread Reconstruction**:
   - API receives thread request for message ID
   - ThreadAnalyzer queries DatabaseService for replies recursively
   - Returns MessageNode tree structure

### TypeScript Path Aliases

Configured in `tsconfig.json` and `jest.config.js`:
- `@domain/*` → `src/domain/*`
- `@api/*` → `src/api/*`
- `@services/*` → `src/services/*`
- `@config/*` → `src/config/*`

Always use these aliases for cross-module imports to maintain consistency.

### Database Schema

**Key Tables** (see `src/services/schema.sql`):
- `servers`: Discord guilds/servers
- `channels`: Channels within servers
- `messages`: Message content with reply relationships
- `scrape_jobs`: Job status tracking for async scraping

**Important Design Decision**: The `reply_to_message_id` foreign key constraint is commented out in schema.sql to allow out-of-order message scraping (replies may be scraped before their parent messages).

**Indexes**: Performance indexes on `channel_id`, `reply_to_message_id`, `timestamp`, and `status` fields.

### API Routes

All routes are prefixed with `/api/` (defined in `src/api/index.ts`):
- `/servers`: Server listing and channel lookup
- `/channels`: Channel metadata
- `/messages`: Paginated message retrieval
- `/threads`: Thread tree reconstruction
- `/scrape`: Job management (start, status, resume)

Routes use Express Router pattern and are mounted in `src/api/index.ts`.

### Configuration File

`discord-config.yaml` structure:
```yaml
auth:
  cookies_file: "./cookies.json"

scraping:
  headless: true
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

servers:
  - id: "SERVER_ID"
    name: "Server Name"
    channels:
      - id: "CHANNEL_ID"
        name: "channel-name"
```

Always validate config changes with `npm run validate-config`.

## Testing Strategy

**Test Organization**: All tests are in `__tests__/` directories adjacent to source files.

**Test Levels**:
1. **Unit Tests**: Domain logic (MessageParser, ThreadAnalyzer)
2. **Integration Tests**: API routes with test database (`src/api/__tests__/api.test.ts`)
3. **E2E Tests**: Full scraping workflow (`src/__tests__/e2e-scrape.test.ts`)

**Running Specific Tests**:
```bash
# Run only MessageParser tests
npm test -- MessageParser.test.ts

# Run API integration tests
npm test -- api.test.ts

# Run E2E tests
npm test -- e2e-scrape.test.ts
```

**Test Database**: Integration and E2E tests use an in-memory SQLite database (`:memory:`).

## Common Development Scenarios

### Adding a New API Route
1. Create route file in `src/api/routes/`
2. Import and mount in `src/api/index.ts`
3. Add integration test in `src/api/__tests__/api.test.ts`
4. Use DatabaseService singleton for data access

### Adding a New Domain Feature
1. Create feature directory under `src/domain/`
2. Add types to `src/domain/models/types.ts` if needed
3. Create `__tests__/` directory with unit tests
4. Update DatabaseService if new queries are needed

### Modifying Database Schema
1. Edit `src/services/schema.sql`
2. Run `npm run db:reset` to apply changes to local DB
3. Update TypeScript types in `src/domain/models/types.ts`
4. Update DatabaseService methods if needed
5. Verify all tests pass with `npm test`

### Working with Authentication
- Cookies are stored in `cookies.json` (gitignored)
- Use `npm run auth-setup` to interactively log in via browser
- DiscordBrowserController automatically loads cookies before navigation
- Cookie format: Playwright's `Cookie[]` type from `page.context().cookies()`
