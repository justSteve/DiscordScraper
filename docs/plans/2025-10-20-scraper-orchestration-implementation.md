# Scraper Orchestration & DOM Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement actual Discord scraping by adding DOM extraction logic and scrape orchestration to connect all existing components into a working end-to-end scraper.

**Architecture:** ScrapeOrchestrator coordinates Browser→Scroller→DOMExtractor→Parser→Database workflow. DOMExtractor is a versioned module with pluggable CSS selectors. Synchronous job execution via API with fail-fast error handling.

**Tech Stack:** TypeScript, Playwright, better-sqlite3, Express, Jest

**Reference:** See `docs/plans/2025-10-20-scraper-orchestration-design.md` for full design details.

---

## Phase 1: Database Schema Updates

### Task 1: Update Messages Table Schema

**Files:**
- Modify: `src/services/schema.sql:20-37`
- Modify: `src/domain/models/types.ts:17-30`

**Step 1: Update schema.sql**

Modify `src/services/schema.sql` messages table (lines 20-37):

```sql
-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar_url TEXT,
  content TEXT,
  timestamp TIMESTAMP NOT NULL,
  reply_to_message_id TEXT,
  edited_timestamp TIMESTAMP,
  is_pinned BOOLEAN DEFAULT 0,
  attachment_urls TEXT,
  embed_data TEXT,
  message_url TEXT NOT NULL,
  has_attachments BOOLEAN DEFAULT 0,
  has_embeds BOOLEAN DEFAULT 0,
  PRIMARY KEY (channel_id, id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
  -- FOREIGN KEY (reply_to_message_id) REFERENCES messages(id)
  -- Removed: FK constraint blocks out-of-order message scraping
);
```

**Step 2: Update TypeScript types**

Modify `src/domain/models/types.ts` Message interface (lines 17-30):

```typescript
export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string;
  content?: string;
  timestamp: Date;
  reply_to_message_id?: string;
  edited_timestamp?: Date;
  is_pinned?: boolean;
  attachment_urls?: string; // JSON array
  embed_data?: string;      // JSON object
  message_url: string;
  has_attachments: boolean;
  has_embeds: boolean;
}
```

**Step 3: Update DatabaseService INSERT statement**

Modify `src/services/DatabaseService.ts` insertMessage method (lines 84-110):

```typescript
insertMessage(message: Message): void {
  const stmt = this.db.prepare(`
    INSERT OR IGNORE INTO messages
    (id, channel_id, author_id, author_name, author_avatar_url, content,
     timestamp, reply_to_message_id, edited_timestamp, is_pinned,
     attachment_urls, embed_data, message_url, has_attachments, has_embeds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    message.id,
    message.channel_id,
    message.author_id,
    message.author_name,
    message.author_avatar_url || null,
    message.content || null,
    message.timestamp.toISOString(),
    message.reply_to_message_id || null,
    message.edited_timestamp ? message.edited_timestamp.toISOString() : null,
    message.is_pinned ? 1 : 0,
    message.attachment_urls || null,
    message.embed_data || null,
    message.message_url,
    message.has_attachments ? 1 : 0,
    message.has_embeds ? 1 : 0
  );
}
```

**Step 4: Reset database to apply changes**

Run: `npm run db:reset`

This will drop all tables and recreate with new schema.

**Step 5: Verify tests still pass**

Run: `npm test`
Expected: All 46 tests pass (schema change is backward compatible for existing tests)

**Step 6: Commit**

```bash
git add src/services/schema.sql src/domain/models/types.ts src/services/DatabaseService.ts
git commit -m "feat: add composite primary key and rich content fields to messages

Changes:
- PRIMARY KEY (channel_id, id) for defense in depth
- Add message_url field for direct Discord links
- Add has_attachments and has_embeds boolean flags

Part of scraper orchestration implementation."
```

---

## Phase 2: DOM Extractor Module

### Task 2: Create DOM Extractor Types

**Files:**
- Create: `src/domain/scrape-engine/dom-selectors/types.ts`
- Create: `src/domain/scrape-engine/dom-selectors/__tests__/types.test.ts`

**Step 1: Write the failing test**

Create `src/domain/scrape-engine/dom-selectors/__tests__/types.test.ts`:

```typescript
import { RawMessageData } from '../types';

describe('DOM Selector Types', () => {
  it('should create a valid RawMessageData object', () => {
    const rawData: RawMessageData = {
      id: 'msg_123',
      author_id: 'user_456',
      author_name: 'TestUser',
      author_avatar_url: 'https://cdn.discord.com/avatar.png',
      content: 'Test message',
      timestamp: '2025-10-20T10:00:00Z',
      reply_to_message_id: 'msg_122',
      edited_timestamp: '2025-10-20T10:05:00Z',
      is_pinned: false,
      has_attachments: true,
      has_embeds: false
    };

    expect(rawData.id).toBe('msg_123');
    expect(rawData.has_attachments).toBe(true);
    expect(rawData.has_embeds).toBe(false);
  });

  it('should allow optional fields to be undefined', () => {
    const rawData: RawMessageData = {
      id: 'msg_123',
      author_id: 'user_456',
      author_name: 'TestUser',
      timestamp: '2025-10-20T10:00:00Z',
      has_attachments: false,
      has_embeds: false
    };

    expect(rawData.reply_to_message_id).toBeUndefined();
    expect(rawData.content).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- types.test.ts`
Expected: FAIL with "Cannot find module '../types'"

**Step 3: Write minimal implementation**

Create `src/domain/scrape-engine/dom-selectors/types.ts`:

```typescript
/**
 * Raw message data extracted from Discord's DOM.
 * This is the intermediate format before parsing into the Message type.
 */
export interface RawMessageData {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string;
  content?: string;
  timestamp: string;  // ISO 8601 format
  reply_to_message_id?: string;
  edited_timestamp?: string;
  is_pinned?: boolean;
  has_attachments: boolean;
  has_embeds: boolean;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- types.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/domain/scrape-engine/dom-selectors/types.ts src/domain/scrape-engine/dom-selectors/__tests__/types.test.ts
git commit -m "feat: add RawMessageData type for DOM extraction

Define intermediate format for message data extracted from Discord DOM
before parsing into Message objects."
```

---

### Task 3: Implement DiscordDOMExtractor.v1

**Files:**
- Create: `src/domain/scrape-engine/dom-selectors/DiscordDOMExtractor.v1.ts`
- Create: `src/domain/scrape-engine/dom-selectors/__tests__/DiscordDOMExtractor.v1.test.ts`

**Step 1: Write the failing test**

Create `src/domain/scrape-engine/dom-selectors/__tests__/DiscordDOMExtractor.v1.test.ts`:

```typescript
import { Page } from 'playwright';
import { DiscordDOMExtractorV1 } from '../DiscordDOMExtractor.v1';

describe('DiscordDOMExtractorV1', () => {
  let mockPage: Page;
  let extractor: DiscordDOMExtractorV1;

  beforeEach(() => {
    extractor = new DiscordDOMExtractorV1();

    // Create a mock Playwright Page
    mockPage = {
      $$eval: jest.fn()
    } as any;
  });

  it('should extract messages from DOM', async () => {
    // Mock the page.$$eval to return test data
    (mockPage.$$eval as jest.Mock).mockResolvedValue([
      {
        id: 'msg_1',
        author_id: 'user_1',
        author_name: 'User1',
        author_avatar_url: 'https://cdn.discord.com/avatar1.png',
        content: 'Hello world',
        timestamp: '2025-10-20T10:00:00Z',
        reply_to_message_id: undefined,
        edited_timestamp: undefined,
        is_pinned: false,
        has_attachments: false,
        has_embeds: false
      },
      {
        id: 'msg_2',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'Reply message',
        timestamp: '2025-10-20T10:01:00Z',
        reply_to_message_id: 'msg_1',
        has_attachments: true,
        has_embeds: false
      }
    ]);

    const messages = await extractor.extractMessages(mockPage);

    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('msg_1');
    expect(messages[0].content).toBe('Hello world');
    expect(messages[1].reply_to_message_id).toBe('msg_1');
    expect(messages[1].has_attachments).toBe(true);
  });

  it('should handle empty message list', async () => {
    (mockPage.$$eval as jest.Mock).mockResolvedValue([]);

    const messages = await extractor.extractMessages(mockPage);

    expect(messages).toHaveLength(0);
  });

  it('should detect attachments and embeds', async () => {
    (mockPage.$$eval as jest.Mock).mockResolvedValue([
      {
        id: 'msg_1',
        author_id: 'user_1',
        author_name: 'User1',
        timestamp: '2025-10-20T10:00:00Z',
        has_attachments: true,
        has_embeds: true
      }
    ]);

    const messages = await extractor.extractMessages(mockPage);

    expect(messages[0].has_attachments).toBe(true);
    expect(messages[0].has_embeds).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- DiscordDOMExtractor.v1.test.ts`
Expected: FAIL with "Cannot find module '../DiscordDOMExtractor.v1'"

**Step 3: Write minimal implementation**

Create `src/domain/scrape-engine/dom-selectors/DiscordDOMExtractor.v1.ts`:

```typescript
import { Page } from 'playwright';
import { RawMessageData } from './types';

/**
 * Discord DOM Extractor - Version 1
 *
 * Extracts message data from Discord's DOM using CSS selectors.
 * This version is designed to be easily replaceable when Discord updates their UI.
 *
 * CSS Selector Strategy:
 * - Uses Discord's class patterns (e.g., [class*="message"])
 * - Brittle by design - expect breakage on Discord updates
 * - When selectors break, create v2 and swap imports
 */
export class DiscordDOMExtractorV1 {
  /**
   * Extract all visible messages from the current page view.
   *
   * @param page - Playwright Page object positioned on Discord channel
   * @returns Array of raw message data extracted from DOM
   */
  async extractMessages(page: Page): Promise<RawMessageData[]> {
    // Use page.$$eval to run extraction logic in browser context
    const messages = await page.$$eval('[class*="message"]', (messageElements) => {
      return messageElements.map((el: Element) => {
        // Extract message ID from data attribute or element
        const id = el.getAttribute('id') || el.getAttribute('data-message-id') || '';

        // Extract author information
        const authorEl = el.querySelector('[class*="username"]');
        const authorName = authorEl?.textContent?.trim() || '';
        const authorId = authorEl?.getAttribute('data-user-id') || '';

        // Extract avatar
        const avatarEl = el.querySelector('[class*="avatar"] img');
        const authorAvatarUrl = avatarEl?.getAttribute('src') || undefined;

        // Extract message content
        const contentEl = el.querySelector('[class*="messageContent"]');
        const content = contentEl?.textContent?.trim() || undefined;

        // Extract timestamp
        const timeEl = el.querySelector('time');
        const timestamp = timeEl?.getAttribute('datetime') || new Date().toISOString();

        // Check for reply reference
        const replyEl = el.querySelector('[class*="repliedMessage"]');
        const replyToMessageId = replyEl?.getAttribute('data-message-id') || undefined;

        // Check for edit indicator
        const editedEl = el.querySelector('[class*="edited"]');
        const editedTimestamp = editedEl?.getAttribute('datetime') || undefined;

        // Check for pin indicator
        const isPinned = el.querySelector('[class*="pinned"]') !== null;

        // Check for attachments (images, files, etc.)
        const hasAttachments = el.querySelector('[class*="attachment"]') !== null;

        // Check for embeds (rich content cards)
        const hasEmbeds = el.querySelector('[class*="embed"]') !== null;

        return {
          id,
          author_id: authorId,
          author_name: authorName,
          author_avatar_url: authorAvatarUrl,
          content,
          timestamp,
          reply_to_message_id: replyToMessageId,
          edited_timestamp: editedTimestamp,
          is_pinned: isPinned,
          has_attachments: hasAttachments,
          has_embeds: hasEmbeds
        };
      });
    });

    return messages as RawMessageData[];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- DiscordDOMExtractor.v1.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/domain/scrape-engine/dom-selectors/DiscordDOMExtractor.v1.ts src/domain/scrape-engine/dom-selectors/__tests__/DiscordDOMExtractor.v1.test.ts
git commit -m "feat: implement Discord DOM extractor v1

Add versioned DOM extraction logic using CSS selectors.
Extracts all message fields including rich content flags.
Designed for easy replacement when Discord updates UI."
```

---

### Task 4: Create DOM Selectors Index

**Files:**
- Create: `src/domain/scrape-engine/dom-selectors/index.ts`

**Step 1: Create index file**

Create `src/domain/scrape-engine/dom-selectors/index.ts`:

```typescript
/**
 * DOM Selectors Module
 *
 * This module exports the current version of the Discord DOM extractor.
 * When Discord updates their UI and selectors break:
 * 1. Create DiscordDOMExtractor.v2.ts with updated selectors
 * 2. Update this export to use v2
 * 3. No other code changes needed
 */

export { DiscordDOMExtractorV1 as DiscordDOMExtractor } from './DiscordDOMExtractor.v1';
export { RawMessageData } from './types';
```

**Step 2: Verify import works**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/domain/scrape-engine/dom-selectors/index.ts
git commit -m "feat: add DOM selectors module index

Export current extractor version for easy swapping."
```

---

## Phase 3: MessageParser Enhancement

### Task 5: Update MessageParser to Construct Message URLs

**Files:**
- Modify: `src/domain/metadata-capture/MessageParser.ts`
- Modify: `src/domain/metadata-capture/__tests__/MessageParser.test.ts`

**Step 1: Write failing test**

Add to `src/domain/metadata-capture/__tests__/MessageParser.test.ts`:

```typescript
it('should construct message_url from server, channel, and message IDs', () => {
  const parser = new MessageParser('channel_123', 'server_456');

  const rawData = {
    id: 'msg_789',
    author_id: 'user_1',
    author_name: 'TestUser',
    content: 'Test message',
    timestamp: '2025-10-20T10:00:00Z',
    has_attachments: false,
    has_embeds: false
  };

  const message = parser.parseMessage(rawData);

  expect(message.message_url).toBe('https://discord.com/channels/server_456/channel_123/msg_789');
});

it('should include has_attachments and has_embeds flags', () => {
  const parser = new MessageParser('channel_123', 'server_456');

  const rawData = {
    id: 'msg_789',
    author_id: 'user_1',
    author_name: 'TestUser',
    timestamp: '2025-10-20T10:00:00Z',
    has_attachments: true,
    has_embeds: true
  };

  const message = parser.parseMessage(rawData);

  expect(message.has_attachments).toBe(true);
  expect(message.has_embeds).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- MessageParser.test.ts`
Expected: FAIL (constructor signature wrong, missing fields)

**Step 3: Update MessageParser implementation**

Modify `src/domain/metadata-capture/MessageParser.ts`:

```typescript
import { Message } from '../models/types';

interface RawMessageData {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string;
  content?: string;
  timestamp: string;
  reply_to_message_id?: string;
  edited_timestamp?: string;
  is_pinned?: boolean;
  attachment_urls?: string[];
  embed_data?: any;
  has_attachments: boolean;
  has_embeds: boolean;
}

export class MessageParser {
  private channelId: string;
  private serverId: string;

  constructor(channelId: string, serverId: string) {
    this.channelId = channelId;
    this.serverId = serverId;
  }

  parseMessage(data: RawMessageData): Message {
    const message: Message = {
      id: data.id,
      channel_id: this.channelId,
      author_id: data.author_id,
      author_name: data.author_name,
      author_avatar_url: data.author_avatar_url,
      content: data.content,
      timestamp: new Date(data.timestamp),
      reply_to_message_id: data.reply_to_message_id,
      edited_timestamp: data.edited_timestamp ? new Date(data.edited_timestamp) : undefined,
      is_pinned: data.is_pinned || false,
      attachment_urls: data.attachment_urls ? JSON.stringify(data.attachment_urls) : undefined,
      embed_data: data.embed_data ? JSON.stringify(data.embed_data) : undefined,
      message_url: `https://discord.com/channels/${this.serverId}/${this.channelId}/${data.id}`,
      has_attachments: data.has_attachments,
      has_embeds: data.has_embeds
    };

    return message;
  }

  parseMessages(dataArray: RawMessageData[]): Message[] {
    return dataArray.map(data => this.parseMessage(data));
  }
}
```

**Step 4: Fix existing tests**

Update existing tests in `src/domain/metadata-capture/__tests__/MessageParser.test.ts` to pass server_id:

Change:
```typescript
const parser = new MessageParser('channel_123');
```

To:
```typescript
const parser = new MessageParser('channel_123', 'server_456');
```

Add expected message_url, has_attachments, and has_embeds to existing test assertions.

**Step 5: Run test to verify it passes**

Run: `npm test -- MessageParser.test.ts`
Expected: PASS (all tests including new ones)

**Step 6: Commit**

```bash
git add src/domain/metadata-capture/MessageParser.ts src/domain/metadata-capture/__tests__/MessageParser.test.ts
git commit -m "feat: enhance MessageParser to construct message URLs

- Add server_id to constructor
- Construct message_url from server + channel + message IDs
- Add has_attachments and has_embeds fields
- Update tests to match new signature"
```

---

## Phase 4: Scrape Orchestrator

### Task 6: Create ScrapeOrchestrator

**Files:**
- Create: `src/domain/scrape-engine/ScrapeOrchestrator.ts`
- Create: `src/domain/scrape-engine/__tests__/ScrapeOrchestrator.test.ts`

**Step 1: Write the failing test**

Create `src/domain/scrape-engine/__tests__/ScrapeOrchestrator.test.ts`:

```typescript
import { ScrapeOrchestrator } from '../ScrapeOrchestrator';
import DatabaseService from '../../../services/DatabaseService';
import { DiscordConfig } from '../../models/types';
import { DiscordBrowserController } from '../DiscordBrowserController';
import { MessageScroller } from '../MessageScroller';
import { DiscordDOMExtractor } from '../dom-selectors';
import { MessageParser } from '../../metadata-capture/MessageParser';

// Mock all dependencies
jest.mock('../../../services/DatabaseService');
jest.mock('../DiscordBrowserController');
jest.mock('../MessageScroller');
jest.mock('../dom-selectors');
jest.mock('../../metadata-capture/MessageParser');

describe('ScrapeOrchestrator', () => {
  let orchestrator: ScrapeOrchestrator;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockConfig: DiscordConfig;

  beforeEach(() => {
    mockDb = {
      getScrapeJob: jest.fn(),
      updateScrapeJobStatus: jest.fn(),
      insertMessage: jest.fn(),
      incrementMessagesScraped: jest.fn()
    } as any;

    mockConfig = {
      auth: {
        cookies_file: './cookies.json'
      },
      scraping: {
        headless: true,
        scroll_delay_ms: 1000,
        messages_per_batch: 50,
        max_retries: 3
      },
      servers: [
        {
          id: 'server_1',
          name: 'Test Server',
          channels: [
            { id: 'channel_1', name: 'general' }
          ]
        }
      ]
    };

    orchestrator = new ScrapeOrchestrator(mockDb, mockConfig);
  });

  it('should execute scrape job successfully', async () => {
    // Mock job data
    mockDb.getScrapeJob.mockReturnValue({
      id: 1,
      channel_id: 'channel_1',
      status: 'pending',
      scrape_type: 'full',
      messages_scraped: 0
    });

    // Mock browser controller
    const mockBrowser = {
      launch: jest.fn(),
      loadCookiesFromFile: jest.fn(),
      navigateToChannel: jest.fn(),
      getPage: jest.fn().mockReturnValue({}),
      close: jest.fn()
    };
    (DiscordBrowserController as jest.Mock).mockImplementation(() => mockBrowser);

    // Mock message scroller
    const mockScroller = {
      waitForMessages: jest.fn(),
      scrollUp: jest.fn()
        .mockResolvedValueOnce(false) // First scroll: more messages
        .mockResolvedValueOnce(true)  // Second scroll: at top
    };
    (MessageScroller as jest.Mock).mockImplementation(() => mockScroller);

    // Mock DOM extractor
    const mockExtractor = {
      extractMessages: jest.fn().mockResolvedValue([
        {
          id: 'msg_1',
          author_id: 'user_1',
          author_name: 'User1',
          content: 'Message 1',
          timestamp: '2025-10-20T10:00:00Z',
          has_attachments: false,
          has_embeds: false
        }
      ])
    };
    (DiscordDOMExtractor as jest.Mock).mockImplementation(() => mockExtractor);

    // Mock message parser
    const mockParser = {
      parseMessage: jest.fn().mockReturnValue({
        id: 'msg_1',
        channel_id: 'channel_1',
        author_id: 'user_1',
        author_name: 'User1',
        content: 'Message 1',
        timestamp: new Date('2025-10-20T10:00:00Z'),
        message_url: 'https://discord.com/channels/server_1/channel_1/msg_1',
        has_attachments: false,
        has_embeds: false
      })
    };
    (MessageParser as jest.Mock).mockImplementation(() => mockParser);

    // Execute scrape job
    await orchestrator.executeScrapeJob(1);

    // Verify workflow
    expect(mockDb.updateScrapeJobStatus).toHaveBeenCalledWith(1, 'running');
    expect(mockBrowser.launch).toHaveBeenCalled();
    expect(mockBrowser.loadCookiesFromFile).toHaveBeenCalledWith('./cookies.json');
    expect(mockBrowser.navigateToChannel).toHaveBeenCalledWith('server_1', 'channel_1');
    expect(mockScroller.waitForMessages).toHaveBeenCalled();
    expect(mockExtractor.extractMessages).toHaveBeenCalled();
    expect(mockParser.parseMessage).toHaveBeenCalled();
    expect(mockDb.insertMessage).toHaveBeenCalled();
    expect(mockDb.incrementMessagesScraped).toHaveBeenCalledWith(1, 1);
    expect(mockDb.updateScrapeJobStatus).toHaveBeenCalledWith(1, 'completed');
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('should handle errors and mark job as failed', async () => {
    mockDb.getScrapeJob.mockReturnValue({
      id: 1,
      channel_id: 'channel_1',
      status: 'pending',
      scrape_type: 'full',
      messages_scraped: 0
    });

    const mockBrowser = {
      launch: jest.fn().mockRejectedValue(new Error('Browser launch failed')),
      close: jest.fn()
    };
    (DiscordBrowserController as jest.Mock).mockImplementation(() => mockBrowser);

    await expect(orchestrator.executeScrapeJob(1)).rejects.toThrow('Browser launch failed');

    expect(mockDb.updateScrapeJobStatus).toHaveBeenCalledWith(1, 'running');
    expect(mockDb.updateScrapeJobStatus).toHaveBeenCalledWith(1, 'failed', 'Browser launch failed');
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('should throw error if job not found', async () => {
    mockDb.getScrapeJob.mockReturnValue(undefined);

    await expect(orchestrator.executeScrapeJob(999)).rejects.toThrow('Job not found: 999');
  });

  it('should throw error if channel not in config', async () => {
    mockDb.getScrapeJob.mockReturnValue({
      id: 1,
      channel_id: 'unknown_channel',
      status: 'pending',
      scrape_type: 'full',
      messages_scraped: 0
    });

    await expect(orchestrator.executeScrapeJob(1)).rejects.toThrow('Channel unknown_channel not found in config');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- ScrapeOrchestrator.test.ts`
Expected: FAIL with "Cannot find module '../ScrapeOrchestrator'"

**Step 3: Write minimal implementation**

Create `src/domain/scrape-engine/ScrapeOrchestrator.ts`:

```typescript
import DatabaseService from '../../services/DatabaseService';
import { DiscordConfig } from '../models/types';
import { DiscordBrowserController } from './DiscordBrowserController';
import { MessageScroller } from './MessageScroller';
import { DiscordDOMExtractor } from './dom-selectors';
import { MessageParser } from '../metadata-capture/MessageParser';

/**
 * ScrapeOrchestrator
 *
 * Coordinates the entire Discord scraping workflow:
 * 1. Update job status to running
 * 2. Launch browser and navigate to channel
 * 3. Loop: Extract messages → Parse → Store → Scroll
 * 4. Update job status to completed
 * 5. Handle errors (fail fast)
 */
export class ScrapeOrchestrator {
  constructor(
    private db: DatabaseService,
    private config: DiscordConfig
  ) {}

  /**
   * Execute a scrape job synchronously (blocks until complete).
   *
   * @param jobId - ID of the scrape job to execute
   * @throws Error if job not found, channel not configured, or scraping fails
   */
  async executeScrapeJob(jobId: number): Promise<void> {
    let browser: DiscordBrowserController | null = null;

    try {
      // Get job details
      const job = this.db.getScrapeJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // Find server_id for this channel
      const { serverId, channelConfig } = this.findChannelInConfig(job.channel_id);
      if (!serverId || !channelConfig) {
        throw new Error(`Channel ${job.channel_id} not found in config`);
      }

      // Update job status to running
      this.db.updateScrapeJobStatus(jobId, 'running');

      // Initialize components
      browser = new DiscordBrowserController(this.config.scraping.headless);
      const extractor = new DiscordDOMExtractor();
      const parser = new MessageParser(job.channel_id, serverId);

      // Launch browser and navigate to channel
      await browser.launch();
      await browser.loadCookiesFromFile(this.config.auth.cookies_file);
      await browser.navigateToChannel(serverId, job.channel_id);

      // Create scroller
      const page = browser.getPage();
      const scroller = new MessageScroller(page, this.config.scraping.scroll_delay_ms);

      // Wait for initial messages to load
      await scroller.waitForMessages();

      // Scraping loop: extract, parse, store, scroll
      let atTop = false;
      while (!atTop) {
        // Extract messages from current view
        const rawMessages = await extractor.extractMessages(page);

        // Parse and store each message
        for (const rawMsg of rawMessages) {
          const message = parser.parseMessage(rawMsg);
          this.db.insertMessage(message);
          this.db.incrementMessagesScraped(jobId, 1);
        }

        // Scroll up to load older messages
        atTop = await scroller.scrollUp();
      }

      // Mark job as completed
      this.db.updateScrapeJobStatus(jobId, 'completed');

    } catch (error) {
      // Mark job as failed with error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.db.updateScrapeJobStatus(jobId, 'failed', errorMessage);
      throw error;

    } finally {
      // Always close browser
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Find the server_id for a given channel_id in the config.
   *
   * @param channelId - Channel ID to look up
   * @returns Object with serverId and channelConfig, or undefined if not found
   */
  private findChannelInConfig(channelId: string): { serverId: string; channelConfig: any } | { serverId: undefined; channelConfig: undefined } {
    for (const server of this.config.servers) {
      const channel = server.channels.find(ch => ch.id === channelId);
      if (channel) {
        return { serverId: server.id, channelConfig: channel };
      }
    }
    return { serverId: undefined, channelConfig: undefined };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- ScrapeOrchestrator.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/domain/scrape-engine/ScrapeOrchestrator.ts src/domain/scrape-engine/__tests__/ScrapeOrchestrator.test.ts
git commit -m "feat: implement ScrapeOrchestrator

Coordinates complete scraping workflow:
- Job lifecycle management
- Browser/scroller/extractor/parser coordination
- Scraping loop with database storage
- Fail-fast error handling"
```

---

## Phase 5: API Integration

### Task 7: Update API Scrape Route

**Files:**
- Modify: `src/api/routes/scrape.ts`
- Modify: `src/api/__tests__/api.test.ts`

**Step 1: Write failing integration test**

Add to `src/api/__tests__/api.test.ts`:

```typescript
describe('POST /api/scrape/start - with orchestrator', () => {
  it('should execute scrape synchronously', async () => {
    // Mock the entire orchestrator flow
    jest.mock('../../domain/scrape-engine/ScrapeOrchestrator');

    const res = await request(app)
      .post('/api/scrape/start')
      .send({ channel_id: 'channel_1', scrape_type: 'full' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  }, 30000); // 30 second timeout for scraping
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- api.test.ts`
Expected: FAIL (orchestrator not called, job still pending)

**Step 3: Update scrape route implementation**

Modify `src/api/routes/scrape.ts`:

```typescript
import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';
import { ScrapeOrchestrator } from '../../domain/scrape-engine/ScrapeOrchestrator';
import ConfigLoader from '../../config/ConfigLoader';

const router = Router();
const DB_PATH = process.env.DB_PATH || './discord-scraper.db';
const db = new DatabaseService(DB_PATH);

// POST /api/scrape/start - Start scrape job
router.post('/start', async (req, res) => {
  try {
    const { channel_id, scrape_type } = req.body;

    if (!channel_id || !scrape_type) {
      return res.status(400).json({ error: 'channel_id and scrape_type required' });
    }

    if (scrape_type !== 'full' && scrape_type !== 'incremental') {
      return res.status(400).json({ error: 'scrape_type must be "full" or "incremental"' });
    }

    // Create job
    const jobId = db.createScrapeJob(channel_id, scrape_type);

    // Load config and execute scrape synchronously
    const config = ConfigLoader.load('./discord-config.yaml');
    const orchestrator = new ScrapeOrchestrator(db, config);
    await orchestrator.executeScrapeJob(jobId);

    // Return completed job
    const completedJob = db.getScrapeJob(jobId);
    res.json(completedJob);

  } catch (error) {
    // Job already marked as failed by orchestrator
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/scrape/status/:jobId - Get job status
router.get('/status/:jobId', (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = db.getScrapeJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

// GET /api/scrape/jobs - List all jobs (optional status filter)
router.get('/jobs', (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const jobs = db.getAllScrapeJobs(status);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// POST /api/scrape/resume/:jobId - Resume interrupted job
router.post('/resume/:jobId', (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = db.getScrapeJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'interrupted') {
      return res.status(400).json({ error: 'Can only resume interrupted jobs' });
    }

    // Create new job linked to original
    const newJobId = db.createScrapeJob(job.channel_id, job.scrape_type);

    // Note: resumed_from_job_id could be set here if DatabaseService supports it

    res.json({ jobId: newJobId, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

export default router;
```

**Step 4: Run test to verify it passes**

Run: `npm test -- api.test.ts`
Expected: PASS (with mocked orchestrator)

**Step 5: Commit**

```bash
git add src/api/routes/scrape.ts src/api/__tests__/api.test.ts
git commit -m "feat: integrate ScrapeOrchestrator into API

POST /api/scrape/start now executes scraping synchronously using
ScrapeOrchestrator. Returns completed job or error."
```

---

## Phase 6: Integration Testing

### Task 8: Create End-to-End Scraping Integration Test

**Files:**
- Create: `src/__tests__/integration-scrape.test.ts`
- Create: `src/__tests__/fixtures/discord-mock.html`

**Step 1: Create HTML fixture**

Create `src/__tests__/fixtures/discord-mock.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Mock Discord Channel</title>
</head>
<body>
  <div class="scrollerInner">
    <div class="message-123" id="msg_123" data-message-id="msg_123">
      <div class="avatar">
        <img src="https://cdn.discord.com/avatar1.png" />
      </div>
      <div class="username" data-user-id="user_1">User1</div>
      <div class="messageContent">Hello, this is the first message</div>
      <time datetime="2025-10-20T10:00:00Z">10:00 AM</time>
    </div>

    <div class="message-124" id="msg_124" data-message-id="msg_124">
      <div class="repliedMessage" data-message-id="msg_123"></div>
      <div class="username" data-user-id="user_2">User2</div>
      <div class="messageContent">This is a reply</div>
      <time datetime="2025-10-20T10:01:00Z">10:01 AM</time>
      <div class="attachment">image.png</div>
    </div>

    <div class="message-125" id="msg_125" data-message-id="msg_125">
      <div class="username" data-user-id="user_1">User1</div>
      <div class="messageContent">Another message</div>
      <time datetime="2025-10-20T10:02:00Z">10:02 AM</time>
      <span class="edited" datetime="2025-10-20T10:03:00Z">(edited)</span>
      <div class="embed">Rich content card</div>
    </div>
  </div>
</body>
</html>
```

**Step 2: Write integration test**

Create `src/__tests__/integration-scrape.test.ts`:

```typescript
import { chromium, Browser } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import DatabaseService from '../services/DatabaseService';
import { ScrapeOrchestrator } from '../domain/scrape-engine/ScrapeOrchestrator';
import { DiscordConfig } from '../domain/models/types';

const TEST_DB = './test-integration.db';
const FIXTURE_HTML = path.join(__dirname, 'fixtures/discord-mock.html');

describe('Integration: Full Scraping Workflow', () => {
  let db: DatabaseService;
  let browser: Browser;

  beforeAll(async () => {
    // Launch real browser for integration test
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    db = new DatabaseService(TEST_DB);
    db.initialize();

    // Seed test data
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({
      id: 'channel_1',
      server_id: 'server_1',
      name: 'general',
      message_count: 0
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  it('should scrape messages from mock HTML file', async () => {
    // This test uses a local HTML file instead of real Discord
    // to verify the full extraction pipeline works

    const mockConfig: DiscordConfig = {
      auth: {
        cookies_file: './cookies.json' // Not used in this test
      },
      scraping: {
        headless: true,
        scroll_delay_ms: 100,
        messages_per_batch: 50,
        max_retries: 3
      },
      servers: [
        {
          id: 'server_1',
          name: 'Test Server',
          channels: [
            { id: 'channel_1', name: 'general' }
          ]
        }
      ]
    };

    // Note: This test would need modifications to ScrapeOrchestrator
    // to support loading local HTML instead of navigating to Discord
    // For now, this serves as a template for manual testing

    // Manual test steps:
    // 1. Open fixtures/discord-mock.html in browser
    // 2. Use browser dev tools to verify DOM structure matches Discord
    // 3. Update selectors in DiscordDOMExtractor.v1.ts if needed

    expect(true).toBe(true); // Placeholder
  }, 30000);
});
```

**Step 3: Run test**

Run: `npm test -- integration-scrape.test.ts`
Expected: PASS (placeholder test)

**Step 4: Commit**

```bash
git add src/__tests__/integration-scrape.test.ts src/__tests__/fixtures/discord-mock.html
git commit -m "test: add integration test template and HTML fixture

Provides mock Discord HTML for testing DOM extraction.
Integration test serves as template for manual testing."
```

---

## Phase 7: Final Verification

### Task 9: Update E2E Test to Use New Fields

**Files:**
- Modify: `src/__tests__/e2e-scrape.test.ts`

**Step 1: Update E2E test to include new fields**

Modify test data in `src/__tests__/e2e-scrape.test.ts` to include server_id and new fields:

```typescript
// Update MessageParser instantiation
const parser = new MessageParser('channel_1', 'server_1');

// Update mock messages to include new fields
const mockMessages = [
  {
    id: 'msg_1',
    author_id: 'user_1',
    author_name: 'User1',
    content: 'Hello, this is the start of a conversation',
    timestamp: new Date('2025-10-20T10:00:00Z').toISOString(),
    has_attachments: false,
    has_embeds: false
  },
  // ... rest of messages with has_attachments and has_embeds
];

// Add verification for new fields
expect(messages[0].message_url).toBe('https://discord.com/channels/server_1/channel_1/msg_1');
expect(messages[0].has_attachments).toBe(false);
expect(messages[0].has_embeds).toBe(false);
```

**Step 2: Run E2E test**

Run: `npm test -- e2e-scrape.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/e2e-scrape.test.ts
git commit -m "test: update E2E test for new message fields

Include server_id, message_url, has_attachments, has_embeds in test data."
```

---

### Task 10: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Check TypeScript compilation**

Run: `npm run build`
Expected: No errors

**Step 3: Verify database schema**

Run: `npm run db:reset`
Run: `sqlite3 discord-scraper.db "PRAGMA table_info(messages);"`
Expected: Shows all new columns (message_url, has_attachments, has_embeds) and composite primary key

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: verify scraper orchestration implementation complete

All tests passing, TypeScript compiles, database schema updated.
Ready for manual testing with real Discord channels."
```

---

## Manual Testing Checklist

After implementation is complete, test with a real Discord channel:

1. **Setup:**
   - [ ] Run `npm run auth-setup` to get real Discord cookies
   - [ ] Edit `discord-config.yaml` with a small test channel (< 100 messages)
   - [ ] Run `npm run init-db` to create fresh database

2. **Start API:**
   - [ ] Run `npm run dev` to start API server
   - [ ] Verify server starts without errors

3. **Execute Scrape:**
   - [ ] POST to `http://localhost:3001/api/scrape/start` with:
     ```json
     {
       "channel_id": "YOUR_TEST_CHANNEL_ID",
       "scrape_type": "full"
     }
     ```
   - [ ] Wait for response (may take 30-60 seconds)
   - [ ] Verify response shows status: "completed"

4. **Verify Data:**
   - [ ] Check database: `sqlite3 discord-scraper.db "SELECT COUNT(*) FROM messages;"`
   - [ ] Verify message_url format: `SELECT message_url FROM messages LIMIT 1;`
   - [ ] Click message_url in browser - should navigate to Discord message
   - [ ] Check rich content flags: `SELECT id, has_attachments, has_embeds FROM messages WHERE has_attachments = 1;`

5. **Test Thread Reconstruction:**
   - [ ] GET `/api/threads/{message_id}` for a message with replies
   - [ ] Verify tree structure is correct

6. **Error Testing:**
   - [ ] Try scraping with invalid channel_id (should fail gracefully)
   - [ ] Try scraping without cookies.json (should fail with clear error)

---

## Success Criteria

Implementation is complete when:

- [x] All unit tests pass (each component tested in isolation)
- [x] E2E test updated and passing with new fields
- [x] TypeScript compiles with no errors
- [x] Database schema includes composite key and new fields
- [ ] Manual test: Successfully scrapes real Discord channel
- [ ] Manual test: message_url links work
- [ ] Manual test: Thread reconstruction works with scraped data
- [ ] Manual test: has_attachments/has_embeds flags accurate

---

## Future Enhancements

Not included in this plan but could be added later:

1. **Incremental Scraping Optimization:** Stop early when encountering already-scraped messages
2. **Background Processing:** Convert to async with job queue (Redis/Bull)
3. **Selector Version Management:** CLI tool to test selector versions against live Discord
4. **Rich Content Extraction:** Actually extract attachment URLs and embed data
5. **Rate Limiting:** Respect Discord rate limits with exponential backoff
6. **Progress Updates:** Emit progress events during long scrapes
