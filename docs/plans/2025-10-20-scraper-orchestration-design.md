# Discord Scraper Orchestration & DOM Extraction Design

**Date:** 2025-10-20
**Status:** Approved for Implementation

## Overview

This design adds the missing pieces to connect the existing scraper foundation into a working end-to-end system:
1. **DOM extraction logic** with Discord-specific CSS selectors
2. **Scrape orchestration** to coordinate the workflow
3. **API integration** for synchronous job execution

## Design Constraints

- **Processing model:** Immediate/synchronous execution (API blocks until scrape completes)
- **Concurrency:** Serial processing (one scrape job at a time)
- **DOM strategy:** CSS selectors, designed for easy replacement when Discord updates
- **Error handling:** Fail fast (no retries, clear error messages)
- **Field extraction:** All metadata except rich content (attachments/embeds logged as flags only)
- **Message links:** Every message gets a direct Discord URL

## Architecture

### Component Structure

**New Components:**

1. **`ScrapeOrchestrator`** (`src/domain/scrape-engine/ScrapeOrchestrator.ts`)
   - Coordinates entire scraping workflow
   - Manages job status updates
   - Handles synchronous execution
   - Dependencies: DatabaseService, DiscordBrowserController, MessageScroller, MessageParser, DOMExtractor

2. **`DiscordDOMExtractor.v1`** (`src/domain/scrape-engine/dom-selectors/DiscordDOMExtractor.v1.ts`)
   - Separate versioned module for Discord-specific selectors
   - Encapsulates all CSS selector logic
   - Returns raw message data structures
   - Version number in filename enables easy swapping

3. **Modified `/api/scrape/start` endpoint**
   - Creates job with 'pending' status
   - Instantiates ScrapeOrchestrator
   - Calls `orchestrator.executeScrapeJob(jobId)` (blocks)
   - Returns completed job or error

### Module Organization

```
src/domain/scrape-engine/
├── DiscordBrowserController.ts      # Existing
├── MessageScroller.ts                # Existing
├── ScrapeOrchestrator.ts             # NEW
└── dom-selectors/
    ├── types.ts                      # NEW - RawMessageData interface
    ├── DiscordDOMExtractor.v1.ts     # NEW - Current selector implementation
    └── index.ts                      # NEW - Exports current version
```

**Versioning Strategy:** When Discord updates their UI, create `DiscordDOMExtractor.v2.ts` with new selectors and update the export in `index.ts`. No changes needed elsewhere.

## Data Flow

### Execution Sequence

**1. Setup Phase (API endpoint):**
- Validate request body
- Create job in database (status: 'pending')
- Load DiscordConfig to get server_id for channel
- Instantiate ScrapeOrchestrator

**2. Orchestrator.executeScrapeJob(jobId):**
- Update job status to 'running'
- Launch DiscordBrowserController (headless from config)
- Load cookies from `cookies.json`
- Navigate to `https://discord.com/channels/{server_id}/{channel_id}`

**3. Scraping Loop:**
```
while (!atTop) {
  1. Wait for messages to load (MessageScroller.waitForMessages())
  2. Extract current batch (DOMExtractor.extractMessages(page))
  3. For each raw message:
     - Parse to Message object (MessageParser.parseMessage())
     - Construct message_url from server_id + channel_id + message_id
     - Insert into database (duplicates ignored by composite key)
     - Increment job counter
  4. Scroll up (atTop = MessageScroller.scrollUp())
}
```

**4. Cleanup:**
- Update job status to 'completed'
- Close browser
- Return job summary

**On Error:**
- Catch exception
- Update job status to 'failed' with error_message
- Close browser
- Throw error (client receives 500)

## Component Details

### DOMExtractor

**File:** `src/domain/scrape-engine/dom-selectors/DiscordDOMExtractor.v1.ts`

**Interface:**
```typescript
interface RawMessageData {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string;
  content?: string;
  timestamp: string;  // ISO format
  reply_to_message_id?: string;
  edited_timestamp?: string;
  is_pinned?: boolean;
  has_attachments: boolean;
  has_embeds: boolean;
}

class DiscordDOMExtractor {
  async extractMessages(page: Page): Promise<RawMessageData[]>
}
```

**Responsibilities:**
- Accept Playwright Page object
- Use CSS selectors to locate message elements (e.g., `[class*="message"]`)
- Extract all fields from DOM nodes
- Return array of raw message data
- **Does NOT** construct message_url (MessageParser does this with server_id context)

**Selector Strategy:**
- Use Discord's CSS class patterns (brittle but fast)
- Code with assumption that updates will break selectors
- When Discord updates, all servers break simultaneously
- Fix by creating new versioned extractor with updated selectors

### ScrapeOrchestrator

**File:** `src/domain/scrape-engine/ScrapeOrchestrator.ts`

**Interface:**
```typescript
class ScrapeOrchestrator {
  constructor(
    private db: DatabaseService,
    private config: DiscordConfig
  ) {}

  async executeScrapeJob(jobId: number): Promise<void>
}
```

**Responsibilities:**

1. **Job lifecycle management:**
   - Transition: pending → running → completed/failed
   - Track messages_scraped count
   - Set timestamps (started_at, completed_at)
   - Store error_message on failure

2. **Component coordination:**
   - Instantiate browser controller with config settings
   - Create MessageScroller with scroll_delay_ms from config
   - Create MessageParser with channel_id
   - Lookup server_id from config.servers

3. **Main execution loop:**
   - Extract batch → Parse batch → Store batch → Scroll
   - Continue until at top of channel
   - Update job progress after each batch

4. **Error handling:**
   - Try-catch around entire operation
   - On error: set status='failed', store error.message
   - Always close browser in finally block

**Testability:** All dependencies injected, fully mockable for unit tests.

### MessageParser Enhancement

**File:** `src/domain/metadata-capture/MessageParser.ts`

**Changes needed:**
- Constructor accepts both `channel_id` AND `server_id`
- `parseMessage()` constructs `message_url`:
  ```typescript
  message_url: `https://discord.com/channels/${this.server_id}/${this.channel_id}/${data.id}`
  ```

### API Route Modification

**File:** `src/api/routes/scrape.ts`

**Changes to POST /start:**
```typescript
router.post('/start', async (req, res) => {
  try {
    const { channel_id, scrape_type } = req.body;

    // Validation (existing)
    if (!channel_id || !scrape_type) {
      return res.status(400).json({ error: 'channel_id and scrape_type required' });
    }
    if (scrape_type !== 'full' && scrape_type !== 'incremental') {
      return res.status(400).json({ error: 'scrape_type must be "full" or "incremental"' });
    }

    // Create job
    const jobId = db.createScrapeJob(channel_id, scrape_type);

    // NEW: Execute scrape synchronously
    const config = ConfigLoader.load('./discord-config.yaml');
    const orchestrator = new ScrapeOrchestrator(db, config);
    await orchestrator.executeScrapeJob(jobId);

    // Return completed job
    const completedJob = db.getScrapeJob(jobId);
    res.json(completedJob);

  } catch (error) {
    // Job already marked as failed by orchestrator
    res.status(500).json({ error: error.message });
  }
});
```

## Database Schema Changes

**File:** `src/services/schema.sql`

### 1. Composite Primary Key

**Change:**
```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  -- ... other fields ...
  PRIMARY KEY (channel_id, id),  -- Changed from: id TEXT PRIMARY KEY
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);
```

**Rationale:**
- Defense in depth: Don't rely on Discord's Snowflake ID global uniqueness
- Explicit semantics: Messages scoped to channels
- Better query performance for channel-based lookups

### 2. New Fields

**Add to messages table:**
```sql
message_url TEXT NOT NULL,
has_attachments BOOLEAN DEFAULT 0,
has_embeds BOOLEAN DEFAULT 0
```

**Update Message type:**
```typescript
export interface Message {
  // ... existing fields ...
  message_url: string;           // NEW
  has_attachments: boolean;      // NEW
  has_embeds: boolean;           // NEW
  attachment_urls?: string;      // Keep but don't populate
  embed_data?: string;           // Keep but don't populate
}
```

## Testing Strategy

### 1. Unit Tests

**DOMExtractor:**
- Mock Playwright Page object
- Provide HTML fixture with Discord message structure
- Verify correct field extraction
- Test edge cases: missing fields, malformed HTML

**ScrapeOrchestrator:**
- Mock all dependencies (db, browser, scroller, extractor, parser)
- Verify workflow sequence
- Test error handling paths
- Verify job status transitions

### 2. Integration Test

**Approach:**
- Create test HTML file mimicking Discord's DOM structure
- Use Playwright to load local file
- Run full scrape with real components (except browser navigates to local file)
- Verify database results

**File:** `src/__tests__/integration-scrape.test.ts`

### 3. Manual Testing

**Steps:**
1. Run `npm run auth-setup` to get real Discord cookies
2. Configure small test channel in `discord-config.yaml`
3. Start API server
4. POST to `/api/scrape/start` with test channel
5. Verify in database:
   - Messages inserted correctly
   - message_url links work
   - Thread relationships preserved
   - has_attachments/has_embeds flags accurate

## Implementation Notes

### Incremental Scraping

For the initial implementation, both 'full' and 'incremental' scrape types work identically:
- Scroll to top of channel
- Extract all messages
- Database deduplication handles already-scraped messages

**Future optimization:** Incremental could stop early when encountering messages already in database, but this requires careful handling of message gaps.

### Error Cases

**Fail fast on:**
- Cookie authentication fails (401/403)
- Network timeout
- Element not found (CSS selectors broken)
- Invalid message data

**All errors:**
- Update job status to 'failed'
- Store error.message in database
- Close browser cleanly
- Return 500 to client

### Performance Considerations

**Synchronous execution means:**
- Client waits for entire scrape
- Single API server can only run one scrape at a time
- Long-running scrapes may timeout (adjust client/server timeouts)

**For production:** Could add timeout parameter and implement "interrupted" status if scrape exceeds limit, then allow resume.

## Migration Path

### Adding Background Processing (Future)

When ready to make async:
1. Add job queue (Redis, Bull, etc.)
2. POST /start creates job and enqueues
3. Separate worker process runs ScrapeOrchestrator
4. No changes needed to ScrapeOrchestrator itself
5. Client polls GET /status/:jobId

### Updating DOM Selectors

When Discord updates UI:
1. Create `DiscordDOMExtractor.v2.ts` with new selectors
2. Update `dom-selectors/index.ts` to export v2
3. No other code changes needed
4. Deploy

## Success Criteria

Implementation is complete when:
- [ ] POST /api/scrape/start successfully scrapes test channel
- [ ] All messages stored with correct fields
- [ ] message_url links navigate to correct Discord messages
- [ ] Thread relationships reconstructed correctly via ThreadAnalyzer
- [ ] has_attachments and has_embeds flags set accurately
- [ ] Job status tracked correctly (pending→running→completed)
- [ ] Errors fail gracefully with useful error messages
- [ ] Unit tests pass for new components
- [ ] Integration test validates full workflow
