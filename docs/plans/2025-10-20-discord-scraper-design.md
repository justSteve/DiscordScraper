# Discord Scraper Design

**Date:** October 20, 2025
**Project:** DiscordScraper
**Architecture Pattern:** Enterprise Architecture (Infrastructure + Domain)

## Overview

DiscordScraper is a full-stack web application for scraping Discord channel message history with emphasis on thread reconstruction through reply-chain analysis. Built following the enterprise architecture pattern with shared infrastructure packages and domain-specific business logic.

## Requirements

### Functional Requirements
- Scrape full message history from multiple Discord servers and channels
- Capture rich metadata: authors, timestamps, attachments, embeds, reply relationships
- Track reply chains to reconstruct conversation threads (non-official Discord threads)
- Support incremental scraping (capture only new messages since last scrape)
- Resume interrupted scrape sessions
- Web dashboard for monitoring and browsing scraped data
- Configuration-driven channel selection

### Non-Functional Requirements
- SQLite database for simple, portable storage
- Secure authentication via manual login + cookie persistence
- Config file as single source of truth
- API + Dashboard interface (no CLI required for operation)

### Explicit Non-Requirements (v1)
- ❌ Reaction capture (deferred to reduce complexity)
- ❌ User detail levels per channel (all channels scrape same metadata)
- ❌ Real-time scraping (batch operation only)
- ❌ Multi-user support (single-user initially)

## Architecture

### Enterprise Pattern Integration

**Infrastructure Tier** (`/root/packages/`):
- `@myorg/api-server` - Express + CORS + health checks + error handling
- `@myorg/dashboard-ui` - React + Material-UI layout + dark theme

**Domain Tier** (`/root/projects/discord-scraper/`):
- Domain-specific business logic organized by capability
- Uses shared packages via `file://` protocol

### Project Structure

```
/root/projects/discord-scraper/
├── src/
│   ├── domain/                      # Core business logic
│   │   ├── scrape-engine/          # Playwright automation
│   │   │   ├── DiscordBrowserController.ts
│   │   │   ├── MessageScroller.ts
│   │   │   ├── DOMScraper.ts
│   │   │   └── __tests__/
│   │   │
│   │   ├── metadata-capture/       # Extract structured data
│   │   │   ├── MessageParser.ts
│   │   │   ├── AttachmentExtractor.ts
│   │   │   ├── EmbedExtractor.ts
│   │   │   └── __tests__/
│   │   │
│   │   ├── thread-reconstruction/  # Build conversation trees
│   │   │   ├── ThreadAnalyzer.ts
│   │   │   ├── ConversationBuilder.ts
│   │   │   └── __tests__/
│   │   │
│   │   └── models/                 # TypeScript types
│   │       ├── types.ts
│   │       └── ConfigTypes.ts
│   │
│   ├── api/                        # API layer
│   │   ├── routes/
│   │   │   ├── servers.ts
│   │   │   ├── channels.ts
│   │   │   ├── messages.ts
│   │   │   ├── threads.ts
│   │   │   └── scrape.ts
│   │   └── index.ts                # Uses @myorg/api-server
│   │
│   ├── frontend/                   # UI layer
│   │   ├── components/
│   │   │   ├── ServerList.tsx
│   │   │   ├── ScrapeControl.tsx
│   │   │   ├── MessageViewer.tsx
│   │   │   ├── ThreadVisualizer.tsx
│   │   │   └── JobMonitor.tsx
│   │   └── App.tsx                 # Uses @myorg/dashboard-ui
│   │
│   ├── services/                   # Infrastructure services
│   │   ├── DatabaseService.ts      # SQLite operations
│   │   └── ScrapeJobQueue.ts       # Job management
│   │
│   └── config/                     # Config management
│       ├── ConfigLoader.ts
│       └── ConfigValidator.ts
│
├── discord-config.yaml             # Channel configuration
├── cookies.json                    # Discord session (gitignored)
├── discord-scraper.db              # SQLite database (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

## Database Schema

### Tables

**servers** - Discord guilds
```sql
CREATE TABLE servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scraped_at TIMESTAMP
);
```

**channels** - Channels within servers
```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_scraped TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  last_message_id TEXT,
  last_message_timestamp TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(id)
);
```

**messages** - Message content and metadata
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar_url TEXT,
  content TEXT,
  timestamp TIMESTAMP NOT NULL,
  reply_to_message_id TEXT,        -- Key for thread reconstruction
  edited_timestamp TIMESTAMP,
  is_pinned BOOLEAN DEFAULT 0,
  attachment_urls TEXT,             -- JSON array
  embed_data TEXT,                  -- JSON for embeds
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (reply_to_message_id) REFERENCES messages(id)
);
```

**scrape_jobs** - Track scraping progress
```sql
CREATE TABLE scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'pending', 'running', 'completed', 'failed', 'interrupted'
  scrape_type TEXT NOT NULL,        -- 'full' or 'incremental'
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  messages_scraped INTEGER DEFAULT 0,
  error_message TEXT,
  resumed_from_job_id INTEGER,
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (resumed_from_job_id) REFERENCES scrape_jobs(id)
);
```

### Thread Reconstruction Strategy

The `reply_to_message_id` foreign key creates a graph structure:
- Query all replies to a message: `SELECT * FROM messages WHERE reply_to_message_id = ?`
- Build conversation tree: Recursive traversal from root message
- Identify conversation roots: Messages where `reply_to_message_id IS NULL`

## Domain Capabilities

### scrape-engine - Playwright Automation

**Responsibilities:**
- Launch and manage Playwright browser instance
- Load Discord session cookies
- Navigate to channel URLs
- Scroll through message history
- Extract raw DOM elements

**Key Classes:**
- `DiscordBrowserController` - Browser lifecycle, navigation, cookie management
- `MessageScroller` - Scroll logic, detect when reached top, batch loading
- `DOMScraper` - Select and extract message DOM elements

**Testing:**
- Mock Playwright page object
- Verify scroll detection logic
- Test DOM selector resilience

### metadata-capture - Data Extraction

**Responsibilities:**
- Parse Discord's DOM structure
- Extract message content and metadata
- Handle attachments and embeds
- Normalize data for database storage

**Key Classes:**
- `MessageParser` - Core message data (content, author, timestamp)
- `AttachmentExtractor` - Image/file URLs from attachments
- `EmbedExtractor` - Structured data from Discord embeds

**Testing:**
- Feed sample Discord HTML
- Verify correct field extraction
- Handle missing/optional fields gracefully

### thread-reconstruction - Conversation Analysis

**Responsibilities:**
- Analyze reply relationships
- Build conversation trees
- Identify thread roots
- Generate thread summaries

**Key Classes:**
- `ThreadAnalyzer` - Traverse reply_to_message_id relationships
- `ConversationBuilder` - Construct tree structures from flat message list

**Testing:**
- Create sample message graphs
- Verify tree construction correctness
- Handle orphaned replies (referenced message not in DB)

## API Design

### Endpoints

**Server Management**
- `GET /api/servers` - List all configured servers
- `GET /api/servers/:id/channels` - List channels for a server

**Channel & Message Access**
- `GET /api/channels` - List all channels (optional server filter)
- `GET /api/messages/:channelId` - Get messages for channel (pagination support)
- `GET /api/threads/:messageId` - Get full conversation thread from message

**Scraping Operations**
- `POST /api/scrape/start` - Start scrape job (body: `{channel_id, scrape_type}`)
- `GET /api/scrape/status/:jobId` - Get job status and progress
- `GET /api/scrape/jobs` - List all scrape jobs (filter by status)
- `POST /api/scrape/resume/:jobId` - Resume interrupted job

**Health**
- `GET /api/health` - System health check (from @myorg/api-server)

### API Implementation

```typescript
import { createApiServer, startServer } from '@myorg/api-server';

const app = createApiServer({
  dbPath: './discord-scraper.db',
  enableLogging: true
});

// Add domain routes
app.use('/api/servers', serversRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/threads', threadsRouter);
app.use('/api/scrape', scrapeRouter);

startServer(app, 3001);
```

## Frontend Design

### Dashboard Views

**1. Home - Server/Channel Overview**
- List of configured servers (from discord-config.yaml)
- Expandable channel list per server
- Quick stats: last scraped, message count
- "Scrape" and "Update" buttons per channel

**2. Scrape Monitor**
- Active jobs with real-time progress
- Progress bar (messages_scraped / estimated_total)
- Job history (completed, failed, interrupted)
- "Resume" button for interrupted jobs
- Error messages for failed jobs

**3. Message Browser**
- Select server → channel → view messages
- Pagination (50 messages per page)
- Click message to see thread view
- Filter by date range, author

**4. Thread Visualizer**
- Tree visualization of reply chains
- Expandable/collapsible nodes
- Click node to see full message content
- Highlight conversation roots

### Components (using @myorg/dashboard-ui)

```typescript
import { DashboardLayout } from '@myorg/dashboard-ui';
import { Grid } from '@mui/material';

function App() {
  return (
    <DashboardLayout title="Discord Scraper">
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <ServerList />
        </Grid>
        <Grid item xs={12} md={8}>
          <ScrapeControl />
          <JobMonitor />
        </Grid>
      </Grid>
    </DashboardLayout>
  );
}
```

### Real-Time Updates

**Polling Strategy:**
- During active scrape: Poll `/api/scrape/status/:jobId` every 2 seconds
- Update progress bar, messages_scraped count
- Stop polling when status = 'completed' or 'failed'
- No WebSocket complexity for v1 (YAGNI)

## Scraping Workflow

### First-Time Authentication Setup

```bash
npm run auth-setup
```

1. Launches visible Playwright browser
2. User manually logs into Discord
3. Script saves cookies to `cookies.json`
4. Cookie file is gitignored for security
5. All future scrapes use saved cookies (headless mode)

### Scraping Process Flow

**Full Scrape (First Time):**
1. User clicks "Scrape" in dashboard
2. POST to `/api/scrape/start` with `{channel_id, scrape_type: 'full'}`
3. Create scrape_job record (status: 'pending')
4. Background worker picks up job:
   - Launch Playwright (headless)
   - Load cookies.json
   - Navigate to Discord channel URL
   - Scroll to bottom of channel
   - Scroll up repeatedly, parse messages in each viewport
   - Insert messages (using `INSERT OR IGNORE` to handle duplicates)
   - Update job.messages_scraped every 50 messages
   - Stop when no new messages load (reached top)
5. Update channels table: last_scraped, last_message_id, message_count
6. Update scrape_job: status='completed', completed_at timestamp

**Incremental Scrape (Update):**
1. User clicks "Update" in dashboard
2. POST to `/api/scrape/start` with `{channel_id, scrape_type: 'incremental'}`
3. Query channels.last_message_timestamp
4. Background worker:
   - Navigate to channel
   - Scroll from bottom (newest messages)
   - Parse messages until timestamp <= last_message_timestamp
   - Much faster than full scrape (only new messages)

**Resume Interrupted Scrape:**
1. Detect interrupted jobs (status='running' but process not active)
2. Mark as status='interrupted'
3. User clicks "Resume" → POST to `/api/scrape/resume/:jobId`
4. Query latest message timestamp in DB for that channel
5. Start scraping from that point forward
6. Link new job to original: `resumed_from_job_id`

### Playwright Configuration

```typescript
{
  headless: true,                    // Visible only for auth-setup
  userAgent: 'Mozilla/5.0 ...',      // Real Chrome UA string
  viewport: { width: 1920, height: 1080 },
  slowMo: 1500,                      // 1.5s delay between scrolls
}
```

### Error Handling

**Rate Limiting:**
- Detect Discord rate limit responses
- Exponential backoff: 5s, 10s, 20s
- Max 3 retries before marking job as failed

**Network Failures:**
- Save progress (messages already scraped remain in DB)
- Mark job status='failed', record error_message
- User can resume from last successful point

**Cookie Expiry:**
- Detect Discord login screen during scrape
- Immediately fail job with clear message: "Session expired, run npm run auth-setup"
- Don't waste time scraping while logged out

**DOM Structure Changes:**
- Log warnings for unparseable messages
- Skip problematic messages (don't crash entire scrape)
- Continue processing remaining messages
- Report count of skipped messages in job summary

## Configuration File

### discord-config.yaml

```yaml
# Discord authentication
auth:
  cookies_file: "./cookies.json"

# Playwright settings
scraping:
  headless: true
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

# Servers and channels to scrape
servers:
  - id: "123456789"
    name: "My Server"
    channels:
      - id: "987654321"
        name: "general"
      - id: "987654322"
        name: "announcements"

  - id: "111222333"
    name: "Another Server"
    channels:
      - id: "444555666"
        name: "tech-talk"
```

### Configuration Validation

- `ConfigLoader` - Parse YAML, load into TypeScript types
- `ConfigValidator` - Verify required fields, valid IDs, no duplicates
- Run validation on startup and before each scrape
- Clear error messages for configuration issues

## Testing Strategy

### Domain Layer Tests

**scrape-engine/__tests__/**
- Mock Playwright Page object
- Verify scroll detection (reached top of channel)
- Test cookie loading logic
- Verify DOM selector queries

**metadata-capture/__tests__/**
- Feed sample Discord HTML fragments
- Verify correct field extraction (author, content, timestamp)
- Test handling of missing fields (deleted users, removed content)
- Verify attachment URL extraction

**thread-reconstruction/__tests__/**
- Create sample message graphs with reply relationships
- Verify tree construction produces correct structure
- Test orphaned reply handling (reply_to_message_id points to non-existent message)
- Verify root message identification

### API Layer Tests

- Integration tests with supertest
- Mock database operations
- Verify scrape job creation
- Test status endpoint updates
- Verify thread endpoint returns correct tree structure

### Frontend Tests

- Component rendering with React Testing Library
- Mock API responses
- Verify scrape progress display updates
- Test thread visualization rendering

## Initial Setup Commands

```bash
# First-time setup
npm install --legacy-peer-deps
npm run init-db                # Create SQLite schema
npm run validate-config        # Verify discord-config.yaml
npm run auth-setup             # Manual Discord login (saves cookies)

# Development
npm run dev                    # Start API + dashboard
npm run test                   # Run all tests
npm run build                  # Build for production

# Database utilities
npm run db:reset               # Drop and recreate schema (WARNING: deletes data)
npm run db:backup              # Backup discord-scraper.db
```

## Dependencies

### Shared Packages (via file:// protocol)
```json
{
  "@myorg/api-server": "file:../../packages/api-server",
  "@myorg/dashboard-ui": "file:../../packages/dashboard-ui"
}
```

### Core Dependencies
- `playwright` - Browser automation
- `express` - API server (via @myorg/api-server)
- `sqlite3` / `better-sqlite3` - Database
- `react` + `@mui/material` - Frontend (via @myorg/dashboard-ui)
- `yaml` - Config file parsing
- `typescript` - Type safety

## Future Enhancements (Post-v1)

**Not included in initial implementation:**
- Reaction capture (with configurable detail levels)
- Export to JSON/CSV
- Full-text search on message content
- Discord webhook notifications for scrape completion
- Multi-user support with authentication
- Real-time scraping (WebSocket monitoring for new messages)
- Media download (save attachments locally)
- Sentiment analysis on threads
- CLI interface for scripting

## Success Criteria

**v1 is complete when:**
- ✅ Can scrape multiple channels from multiple servers
- ✅ Full and incremental scraping both work
- ✅ Resume interrupted scrapes
- ✅ Thread reconstruction builds conversation trees
- ✅ Dashboard displays servers, channels, messages, threads
- ✅ Real-time progress monitoring during scrapes
- ✅ All tests passing
- ✅ Documentation complete (README, setup guide)

---

**Next Steps:**
1. Set up git worktree for isolated development
2. Create detailed implementation plan
3. Bootstrap project structure following enterprise pattern
4. Implement domain capabilities in order: scrape-engine → metadata-capture → thread-reconstruction
