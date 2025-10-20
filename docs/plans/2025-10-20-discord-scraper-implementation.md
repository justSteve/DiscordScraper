# Discord Scraper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-stack Discord channel scraper with thread reconstruction, following the enterprise architecture pattern with shared infrastructure packages.

**Architecture:** Feature-oriented domain organization (scrape-engine, metadata-capture, thread-reconstruction) using @myorg/api-server for backend and @myorg/dashboard-ui for frontend. SQLite database with focus on reply-chain graph structure for conversation threading.

**Tech Stack:** TypeScript, Playwright, SQLite (better-sqlite3), Express (via shared package), React + Material-UI (via shared package), YAML config, Jest

---

## Phase 1: Foundation (Models, Database, Config)

### Task 1: Domain Models and Types

**Files:**
- Create: `src/domain/models/types.ts`
- Test: `src/domain/models/__tests__/types.test.ts`

**Step 1: Write the failing test**

Create `src/domain/models/__tests__/types.test.ts`:
```typescript
import { Server, Channel, Message, ScrapeJob } from '../types';

describe('Domain Types', () => {
  it('should create a valid Server object', () => {
    const server: Server = {
      id: 'server_123',
      name: 'Test Server',
      scraped_at: new Date()
    };
    expect(server.id).toBe('server_123');
    expect(server.name).toBe('Test Server');
  });

  it('should create a valid Channel object', () => {
    const channel: Channel = {
      id: 'channel_456',
      server_id: 'server_123',
      name: 'general',
      last_scraped: new Date(),
      message_count: 0
    };
    expect(channel.id).toBe('channel_456');
    expect(channel.server_id).toBe('server_123');
  });

  it('should create a valid Message object with reply', () => {
    const message: Message = {
      id: 'msg_789',
      channel_id: 'channel_456',
      author_id: 'user_111',
      author_name: 'TestUser',
      content: 'Hello world',
      timestamp: new Date(),
      reply_to_message_id: 'msg_788'
    };
    expect(message.reply_to_message_id).toBe('msg_788');
  });

  it('should create a valid ScrapeJob object', () => {
    const job: ScrapeJob = {
      id: 1,
      channel_id: 'channel_456',
      status: 'pending',
      scrape_type: 'full',
      messages_scraped: 0
    };
    expect(job.status).toBe('pending');
    expect(job.scrape_type).toBe('full');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- types.test.ts`
Expected: FAIL with "Cannot find module '../types'"

**Step 3: Write minimal implementation**

Create `src/domain/models/types.ts`:
```typescript
export interface Server {
  id: string;
  name: string;
  scraped_at?: Date;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  last_scraped?: Date;
  message_count: number;
  last_message_id?: string;
  last_message_timestamp?: Date;
}

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
}

export interface ScrapeJob {
  id?: number;
  channel_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  scrape_type: 'full' | 'incremental';
  started_at?: Date;
  completed_at?: Date;
  messages_scraped: number;
  error_message?: string;
  resumed_from_job_id?: number;
}

export interface DiscordConfig {
  auth: {
    cookies_file: string;
  };
  scraping: {
    headless: boolean;
    scroll_delay_ms: number;
    messages_per_batch: number;
    max_retries: number;
  };
  servers: ConfigServer[];
}

export interface ConfigServer {
  id: string;
  name: string;
  channels: ConfigChannel[];
}

export interface ConfigChannel {
  id: string;
  name: string;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- types.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/domain/models/types.ts src/domain/models/__tests__/types.test.ts
git commit -m "feat: add domain model types

Add TypeScript interfaces for Server, Channel, Message, ScrapeJob,
and configuration types."
```

---

### Task 2: Database Service

**Files:**
- Create: `src/services/DatabaseService.ts`
- Create: `src/services/schema.sql`
- Test: `src/services/__tests__/DatabaseService.test.ts`

**Step 1: Write the database schema**

Create `src/services/schema.sql`:
```sql
-- Servers (Discord guilds)
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scraped_at TIMESTAMP
);

-- Channels within servers
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_scraped TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  last_message_id TEXT,
  last_message_timestamp TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
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
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (reply_to_message_id) REFERENCES messages(id)
);

-- Scrape jobs
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL,
  scrape_type TEXT NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  messages_scraped INTEGER DEFAULT 0,
  error_message TEXT,
  resumed_from_job_id INTEGER,
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (resumed_from_job_id) REFERENCES scrape_jobs(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
```

**Step 2: Write the failing test**

Create `src/services/__tests__/DatabaseService.test.ts`:
```typescript
import DatabaseService from '../DatabaseService';
import { Server, Channel, Message, ScrapeJob } from '../../domain/models/types';
import * as fs from 'fs';

const TEST_DB = './test-discord.db';

describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    db = new DatabaseService(TEST_DB);
    db.initialize();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  describe('Server operations', () => {
    it('should insert and retrieve a server', () => {
      const server: Server = {
        id: 'server_1',
        name: 'Test Server'
      };

      db.insertServer(server);
      const retrieved = db.getServer('server_1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('server_1');
      expect(retrieved?.name).toBe('Test Server');
    });

    it('should list all servers', () => {
      db.insertServer({ id: 's1', name: 'Server 1' });
      db.insertServer({ id: 's2', name: 'Server 2' });

      const servers = db.getAllServers();
      expect(servers).toHaveLength(2);
    });
  });

  describe('Channel operations', () => {
    it('should insert and retrieve a channel', () => {
      db.insertServer({ id: 'server_1', name: 'Test Server' });

      const channel: Channel = {
        id: 'channel_1',
        server_id: 'server_1',
        name: 'general',
        message_count: 0
      };

      db.insertChannel(channel);
      const retrieved = db.getChannel('channel_1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('general');
    });

    it('should get channels by server', () => {
      db.insertServer({ id: 'server_1', name: 'Test Server' });
      db.insertChannel({ id: 'c1', server_id: 'server_1', name: 'general', message_count: 0 });
      db.insertChannel({ id: 'c2', server_id: 'server_1', name: 'random', message_count: 0 });

      const channels = db.getChannelsByServer('server_1');
      expect(channels).toHaveLength(2);
    });
  });

  describe('Message operations', () => {
    beforeEach(() => {
      db.insertServer({ id: 'server_1', name: 'Test' });
      db.insertChannel({ id: 'channel_1', server_id: 'server_1', name: 'general', message_count: 0 });
    });

    it('should insert message with INSERT OR IGNORE for duplicates', () => {
      const message: Message = {
        id: 'msg_1',
        channel_id: 'channel_1',
        author_id: 'user_1',
        author_name: 'TestUser',
        content: 'Hello',
        timestamp: new Date(),
        messages_scraped: 0
      };

      db.insertMessage(message);
      db.insertMessage(message); // Duplicate

      const messages = db.getMessagesByChannel('channel_1');
      expect(messages).toHaveLength(1);
    });

    it('should retrieve messages with reply relationships', () => {
      const msg1: Message = {
        id: 'msg_1',
        channel_id: 'channel_1',
        author_id: 'user_1',
        author_name: 'User1',
        content: 'First message',
        timestamp: new Date(),
        messages_scraped: 0
      };

      const msg2: Message = {
        id: 'msg_2',
        channel_id: 'channel_1',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'Reply to first',
        timestamp: new Date(),
        reply_to_message_id: 'msg_1',
        messages_scraped: 0
      };

      db.insertMessage(msg1);
      db.insertMessage(msg2);

      const replies = db.getReplies('msg_1');
      expect(replies).toHaveLength(1);
      expect(replies[0].id).toBe('msg_2');
    });
  });

  describe('ScrapeJob operations', () => {
    beforeEach(() => {
      db.insertServer({ id: 'server_1', name: 'Test' });
      db.insertChannel({ id: 'channel_1', server_id: 'server_1', name: 'general', message_count: 0 });
    });

    it('should create and update scrape job', () => {
      const jobId = db.createScrapeJob('channel_1', 'full');

      expect(jobId).toBeGreaterThan(0);

      const job = db.getScrapeJob(jobId);
      expect(job?.status).toBe('pending');

      db.updateScrapeJobStatus(jobId, 'running');
      const updated = db.getScrapeJob(jobId);
      expect(updated?.status).toBe('running');
    });

    it('should increment messages_scraped', () => {
      const jobId = db.createScrapeJob('channel_1', 'full');

      db.incrementMessagesScraped(jobId, 50);
      const job = db.getScrapeJob(jobId);

      expect(job?.messages_scraped).toBe(50);
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -- DatabaseService.test.ts`
Expected: FAIL with "Cannot find module '../DatabaseService'"

**Step 4: Write minimal implementation**

Create `src/services/DatabaseService.ts`:
```typescript
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Server, Channel, Message, ScrapeJob } from '../domain/models/types';

class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
  }

  initialize(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }

  close(): void {
    this.db.close();
  }

  // Server operations
  insertServer(server: Server): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO servers (id, name, scraped_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(server.id, server.name, server.scraped_at || null);
  }

  getServer(id: string): Server | undefined {
    const stmt = this.db.prepare('SELECT * FROM servers WHERE id = ?');
    return stmt.get(id) as Server | undefined;
  }

  getAllServers(): Server[] {
    const stmt = this.db.prepare('SELECT * FROM servers ORDER BY name');
    return stmt.all() as Server[];
  }

  // Channel operations
  insertChannel(channel: Channel): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO channels
      (id, server_id, name, last_scraped, message_count, last_message_id, last_message_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      channel.id,
      channel.server_id,
      channel.name,
      channel.last_scraped || null,
      channel.message_count,
      channel.last_message_id || null,
      channel.last_message_timestamp || null
    );
  }

  getChannel(id: string): Channel | undefined {
    const stmt = this.db.prepare('SELECT * FROM channels WHERE id = ?');
    return stmt.get(id) as Channel | undefined;
  }

  getChannelsByServer(serverId: string): Channel[] {
    const stmt = this.db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY name');
    return stmt.all(serverId) as Channel[];
  }

  updateChannelAfterScrape(channelId: string, lastMessageId: string, lastTimestamp: Date, count: number): void {
    const stmt = this.db.prepare(`
      UPDATE channels
      SET last_scraped = CURRENT_TIMESTAMP,
          last_message_id = ?,
          last_message_timestamp = ?,
          message_count = message_count + ?
      WHERE id = ?
    `);
    stmt.run(lastMessageId, lastTimestamp.toISOString(), count, channelId);
  }

  // Message operations
  insertMessage(message: Message): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages
      (id, channel_id, author_id, author_name, author_avatar_url, content,
       timestamp, reply_to_message_id, edited_timestamp, is_pinned,
       attachment_urls, embed_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      message.edited_timestamp?.toISOString() || null,
      message.is_pinned ? 1 : 0,
      message.attachment_urls || null,
      message.embed_data || null
    );
  }

  getMessage(id: string): Message | undefined {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.parseMessage(row) : undefined;
  }

  getMessagesByChannel(channelId: string, limit: number = 100, offset: number = 0): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE channel_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(channelId, limit, offset) as any[];
    return rows.map(row => this.parseMessage(row));
  }

  getReplies(messageId: string): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE reply_to_message_id = ?
      ORDER BY timestamp ASC
    `);
    const rows = stmt.all(messageId) as any[];
    return rows.map(row => this.parseMessage(row));
  }

  getLatestMessageTimestamp(channelId: string): Date | null {
    const stmt = this.db.prepare(`
      SELECT MAX(timestamp) as latest FROM messages WHERE channel_id = ?
    `);
    const result = stmt.get(channelId) as any;
    return result?.latest ? new Date(result.latest) : null;
  }

  // ScrapeJob operations
  createScrapeJob(channelId: string, scrapeType: 'full' | 'incremental'): number {
    const stmt = this.db.prepare(`
      INSERT INTO scrape_jobs (channel_id, status, scrape_type, started_at, messages_scraped)
      VALUES (?, 'pending', ?, CURRENT_TIMESTAMP, 0)
    `);
    const result = stmt.run(channelId, scrapeType);
    return result.lastInsertRowid as number;
  }

  getScrapeJob(id: number): ScrapeJob | undefined {
    const stmt = this.db.prepare('SELECT * FROM scrape_jobs WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.parseScrapeJob(row) : undefined;
  }

  getAllScrapeJobs(status?: string): ScrapeJob[] {
    let stmt;
    if (status) {
      stmt = this.db.prepare('SELECT * FROM scrape_jobs WHERE status = ? ORDER BY started_at DESC');
      const rows = stmt.all(status) as any[];
      return rows.map(row => this.parseScrapeJob(row));
    } else {
      stmt = this.db.prepare('SELECT * FROM scrape_jobs ORDER BY started_at DESC');
      const rows = stmt.all() as any[];
      return rows.map(row => this.parseScrapeJob(row));
    }
  }

  updateScrapeJobStatus(id: number, status: ScrapeJob['status'], errorMessage?: string): void {
    const stmt = this.db.prepare(`
      UPDATE scrape_jobs
      SET status = ?,
          error_message = ?,
          completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = ?
    `);
    stmt.run(status, errorMessage || null, status, id);
  }

  incrementMessagesScraped(id: number, count: number): void {
    const stmt = this.db.prepare(`
      UPDATE scrape_jobs
      SET messages_scraped = messages_scraped + ?
      WHERE id = ?
    `);
    stmt.run(count, id);
  }

  // Helper methods
  private parseMessage(row: any): Message {
    return {
      id: row.id,
      channel_id: row.channel_id,
      author_id: row.author_id,
      author_name: row.author_name,
      author_avatar_url: row.author_avatar_url,
      content: row.content,
      timestamp: new Date(row.timestamp),
      reply_to_message_id: row.reply_to_message_id,
      edited_timestamp: row.edited_timestamp ? new Date(row.edited_timestamp) : undefined,
      is_pinned: row.is_pinned === 1,
      attachment_urls: row.attachment_urls,
      embed_data: row.embed_data
    };
  }

  private parseScrapeJob(row: any): ScrapeJob {
    return {
      id: row.id,
      channel_id: row.channel_id,
      status: row.status,
      scrape_type: row.scrape_type,
      started_at: row.started_at ? new Date(row.started_at) : undefined,
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
      messages_scraped: row.messages_scraped,
      error_message: row.error_message,
      resumed_from_job_id: row.resumed_from_job_id
    };
  }
}

export default DatabaseService;
```

**Step 5: Run test to verify it passes**

Run: `npm test -- DatabaseService.test.ts`
Expected: PASS (all tests)

**Step 6: Commit**

```bash
git add src/services/DatabaseService.ts src/services/schema.sql src/services/__tests__/DatabaseService.test.ts
git commit -m "feat: add DatabaseService with SQLite operations

Implement complete database service with operations for servers,
channels, messages, and scrape jobs. Includes schema creation and
comprehensive test coverage."
```

---

### Task 3: Configuration Loader

**Files:**
- Create: `src/config/ConfigLoader.ts`
- Create: `src/config/ConfigValidator.ts`
- Test: `src/config/__tests__/ConfigLoader.test.ts`

**Step 1: Write the failing test**

Create `src/config/__tests__/ConfigLoader.test.ts`:
```typescript
import ConfigLoader from '../ConfigLoader';
import * as fs from 'fs';
import * as path from 'path';

const TEST_CONFIG_PATH = './test-config.yaml';

describe('ConfigLoader', () => {
  afterEach(() => {
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      fs.unlinkSync(TEST_CONFIG_PATH);
    }
  });

  it('should load valid config file', () => {
    const validConfig = `
auth:
  cookies_file: "./cookies.json"

scraping:
  headless: true
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

servers:
  - id: "server_1"
    name: "Test Server"
    channels:
      - id: "channel_1"
        name: "general"
`;
    fs.writeFileSync(TEST_CONFIG_PATH, validConfig);

    const config = ConfigLoader.load(TEST_CONFIG_PATH);

    expect(config.auth.cookies_file).toBe('./cookies.json');
    expect(config.scraping.headless).toBe(true);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].channels).toHaveLength(1);
  });

  it('should throw error for missing required fields', () => {
    const invalidConfig = `
auth:
  cookies_file: "./cookies.json"
`;
    fs.writeFileSync(TEST_CONFIG_PATH, invalidConfig);

    expect(() => ConfigLoader.load(TEST_CONFIG_PATH)).toThrow();
  });

  it('should throw error for duplicate channel IDs', () => {
    const duplicateConfig = `
auth:
  cookies_file: "./cookies.json"

scraping:
  headless: true
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

servers:
  - id: "server_1"
    name: "Server 1"
    channels:
      - id: "channel_1"
        name: "general"
  - id: "server_2"
    name: "Server 2"
    channels:
      - id: "channel_1"
        name: "random"
`;
    fs.writeFileSync(TEST_CONFIG_PATH, duplicateConfig);

    expect(() => ConfigLoader.load(TEST_CONFIG_PATH)).toThrow('Duplicate channel ID');
  });

  it('should throw error if config file does not exist', () => {
    expect(() => ConfigLoader.load('./nonexistent.yaml')).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- ConfigLoader.test.ts`
Expected: FAIL with "Cannot find module '../ConfigLoader'"

**Step 3: Write minimal implementation**

Create `src/config/ConfigValidator.ts`:
```typescript
import { DiscordConfig } from '../domain/models/types';

export class ConfigValidator {
  static validate(config: any): void {
    // Check required top-level fields
    if (!config.auth || !config.auth.cookies_file) {
      throw new Error('Missing required field: auth.cookies_file');
    }

    if (!config.scraping) {
      throw new Error('Missing required field: scraping');
    }

    const scraping = config.scraping;
    if (typeof scraping.headless !== 'boolean') {
      throw new Error('scraping.headless must be a boolean');
    }
    if (typeof scraping.scroll_delay_ms !== 'number') {
      throw new Error('scraping.scroll_delay_ms must be a number');
    }
    if (typeof scraping.messages_per_batch !== 'number') {
      throw new Error('scraping.messages_per_batch must be a number');
    }
    if (typeof scraping.max_retries !== 'number') {
      throw new Error('scraping.max_retries must be a number');
    }

    if (!config.servers || !Array.isArray(config.servers)) {
      throw new Error('Missing required field: servers (must be an array)');
    }

    // Check for duplicate server IDs
    const serverIds = new Set<string>();
    const channelIds = new Set<string>();

    for (const server of config.servers) {
      if (!server.id || !server.name) {
        throw new Error('Each server must have id and name');
      }

      if (serverIds.has(server.id)) {
        throw new Error(`Duplicate server ID: ${server.id}`);
      }
      serverIds.add(server.id);

      if (!server.channels || !Array.isArray(server.channels)) {
        throw new Error(`Server ${server.id} must have channels array`);
      }

      for (const channel of server.channels) {
        if (!channel.id || !channel.name) {
          throw new Error(`Each channel must have id and name (server: ${server.id})`);
        }

        if (channelIds.has(channel.id)) {
          throw new Error(`Duplicate channel ID: ${channel.id}`);
        }
        channelIds.add(channel.id);
      }
    }
  }
}
```

Create `src/config/ConfigLoader.ts`:
```typescript
import * as fs from 'fs';
import * as yaml from 'yaml';
import { DiscordConfig } from '../domain/models/types';
import { ConfigValidator } from './ConfigValidator';

class ConfigLoader {
  static load(configPath: string): DiscordConfig {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const fileContents = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.parse(fileContents);

    // Validate config structure
    ConfigValidator.validate(config);

    return config as DiscordConfig;
  }
}

export default ConfigLoader;
```

**Step 4: Run test to verify it passes**

Run: `npm test -- ConfigLoader.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/config/ConfigLoader.ts src/config/ConfigValidator.ts src/config/__tests__/ConfigLoader.test.ts
git commit -m "feat: add config loader with validation

Implement YAML config loader with comprehensive validation for
required fields, types, and duplicate ID detection."
```

---

## Phase 2: Domain Capabilities

### Task 4: Scrape Engine - Browser Controller

**Files:**
- Create: `src/domain/scrape-engine/DiscordBrowserController.ts`
- Test: `src/domain/scrape-engine/__tests__/DiscordBrowserController.test.ts`

**Step 1: Write the failing test**

Create `src/domain/scrape-engine/__tests__/DiscordBrowserController.test.ts`:
```typescript
import { DiscordBrowserController } from '../DiscordBrowserController';
import { chromium, Browser, Page } from 'playwright';

jest.mock('playwright');

describe('DiscordBrowserController', () => {
  let controller: DiscordBrowserController;
  let mockBrowser: jest.Mocked<Browser>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    mockPage = {
      goto: jest.fn(),
      context: jest.fn().mockReturnValue({
        addCookies: jest.fn()
      })
    } as any;

    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn()
    } as any;

    (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

    controller = new DiscordBrowserController(true);
  });

  afterEach(async () => {
    if (controller) {
      await controller.close();
    }
  });

  it('should launch browser in headless mode', async () => {
    await controller.launch();

    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true })
    );
  });

  it('should load cookies from file', async () => {
    const mockCookies = [
      { name: 'token', value: 'test_token', domain: '.discord.com', path: '/' }
    ];

    jest.spyOn(controller as any, 'loadCookies').mockReturnValue(mockCookies);

    await controller.launch();
    await controller.loadCookiesFromFile('./cookies.json');

    expect(mockPage.context().addCookies).toHaveBeenCalledWith(mockCookies);
  });

  it('should navigate to channel URL', async () => {
    await controller.launch();
    await controller.navigateToChannel('server_123', 'channel_456');

    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://discord.com/channels/server_123/channel_456',
      expect.any(Object)
    );
  });

  it('should close browser', async () => {
    await controller.launch();
    await controller.close();

    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- DiscordBrowserController.test.ts`
Expected: FAIL with "Cannot find module '../DiscordBrowserController'"

**Step 3: Write minimal implementation**

Create `src/domain/scrape-engine/DiscordBrowserController.ts`:
```typescript
import { chromium, Browser, Page, BrowserContext, Cookie } from 'playwright';
import * as fs from 'fs';

export class DiscordBrowserController {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private headless: boolean;

  constructor(headless: boolean = true) {
    this.headless = headless;
  }

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  }

  async loadCookiesFromFile(cookiesPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    const cookies = this.loadCookies(cookiesPath);
    await this.page.context().addCookies(cookies);
  }

  async saveCookiesToFile(cookiesPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    const cookies = await this.page.context().cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  }

  async navigateToChannel(serverId: string, channelId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    const url = `https://discord.com/channels/${serverId}/${channelId}`;
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched');
    }
    return this.page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  private loadCookies(cookiesPath: string): Cookie[] {
    if (!fs.existsSync(cookiesPath)) {
      throw new Error(`Cookies file not found: ${cookiesPath}`);
    }

    const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
    return JSON.parse(cookiesData);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- DiscordBrowserController.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/domain/scrape-engine/DiscordBrowserController.ts src/domain/scrape-engine/__tests__/DiscordBrowserController.test.ts
git commit -m "feat: add Discord browser controller

Implement Playwright browser controller with cookie management
and channel navigation."
```

---

### Task 5: Scrape Engine - Message Scroller

**Files:**
- Create: `src/domain/scrape-engine/MessageScroller.ts`
- Test: `src/domain/scrape-engine/__tests__/MessageScroller.test.ts`

**Step 1: Write the failing test**

Create `src/domain/scrape-engine/__tests__/MessageScroller.test.ts`:
```typescript
import { MessageScroller } from '../MessageScroller';
import { Page } from 'playwright';

describe('MessageScroller', () => {
  let mockPage: jest.Mocked<Page>;
  let scroller: MessageScroller;

  beforeEach(() => {
    mockPage = {
      evaluate: jest.fn(),
      waitForTimeout: jest.fn()
    } as any;

    scroller = new MessageScroller(mockPage, 1000);
  });

  it('should scroll to bottom first', async () => {
    mockPage.evaluate.mockResolvedValue(undefined);

    await scroller.scrollToBottom();

    expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should scroll up and detect when at top', async () => {
    // First scroll: scrollTop changes (not at top)
    // Second scroll: scrollTop stays same (at top)
    mockPage.evaluate
      .mockResolvedValueOnce(1000) // Initial scroll position
      .mockResolvedValueOnce(500)  // After scroll up
      .mockResolvedValueOnce(500)  // Scroll position unchanged (at top)
      .mockResolvedValueOnce(500); // Confirmation

    const atTop1 = await scroller.scrollUp();
    expect(atTop1).toBe(false);

    const atTop2 = await scroller.scrollUp();
    expect(atTop2).toBe(true);
  });

  it('should wait between scrolls', async () => {
    mockPage.evaluate.mockResolvedValue(1000);

    await scroller.scrollUp();

    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
  });

  it('should get current scroll position', async () => {
    mockPage.evaluate.mockResolvedValue(500);

    const position = await scroller.getCurrentScrollPosition();

    expect(position).toBe(500);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- MessageScroller.test.ts`
Expected: FAIL with "Cannot find module '../MessageScroller'"

**Step 3: Write minimal implementation**

Create `src/domain/scrape-engine/MessageScroller.ts`:
```typescript
import { Page } from 'playwright';

export class MessageScroller {
  private page: Page;
  private scrollDelayMs: number;
  private lastScrollPosition: number = -1;

  constructor(page: Page, scrollDelayMs: number = 1500) {
    this.page = page;
    this.scrollDelayMs = scrollDelayMs;
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => {
      const scroller = document.querySelector('[class*="scrollerInner"]');
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    await this.page.waitForTimeout(this.scrollDelayMs);
  }

  async scrollUp(): Promise<boolean> {
    const beforeScroll = await this.getCurrentScrollPosition();

    // Scroll up by viewport height
    await this.page.evaluate(() => {
      const scroller = document.querySelector('[class*="scrollerInner"]');
      if (scroller) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop - window.innerHeight);
      }
    });

    await this.page.waitForTimeout(this.scrollDelayMs);

    const afterScroll = await this.getCurrentScrollPosition();

    // If scroll position didn't change, we're at the top
    const atTop = beforeScroll === afterScroll;

    this.lastScrollPosition = afterScroll;
    return atTop;
  }

  async getCurrentScrollPosition(): Promise<number> {
    return await this.page.evaluate(() => {
      const scroller = document.querySelector('[class*="scrollerInner"]');
      return scroller ? scroller.scrollTop : 0;
    });
  }

  async waitForMessages(): Promise<void> {
    await this.page.waitForSelector('[class*="message"]', { timeout: 10000 });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- MessageScroller.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/domain/scrape-engine/MessageScroller.ts src/domain/scrape-engine/__tests__/MessageScroller.test.ts
git commit -m "feat: add message scroller for Discord channels

Implement scrolling logic with detection for reaching top of channel."
```

---

### Task 6: Metadata Capture - Message Parser

**Files:**
- Create: `src/domain/metadata-capture/MessageParser.ts`
- Test: `src/domain/metadata-capture/__tests__/MessageParser.test.ts`

**Step 1: Write the failing test**

Create `src/domain/metadata-capture/__tests__/MessageParser.test.ts`:
```typescript
import { MessageParser } from '../MessageParser';
import { Message } from '../../models/types';

describe('MessageParser', () => {
  let parser: MessageParser;

  beforeEach(() => {
    parser = new MessageParser('channel_123');
  });

  it('should parse a basic message', () => {
    const messageData = {
      id: 'msg_1',
      author_id: 'user_1',
      author_name: 'TestUser',
      content: 'Hello world',
      timestamp: '2025-10-20T12:00:00Z'
    };

    const message = parser.parseMessage(messageData);

    expect(message.id).toBe('msg_1');
    expect(message.channel_id).toBe('channel_123');
    expect(message.author_name).toBe('TestUser');
    expect(message.content).toBe('Hello world');
    expect(message.timestamp).toBeInstanceOf(Date);
  });

  it('should parse message with reply', () => {
    const messageData = {
      id: 'msg_2',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'Reply here',
      timestamp: '2025-10-20T12:01:00Z',
      reply_to_message_id: 'msg_1'
    };

    const message = parser.parseMessage(messageData);

    expect(message.reply_to_message_id).toBe('msg_1');
  });

  it('should parse message with attachments', () => {
    const messageData = {
      id: 'msg_3',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Check this out',
      timestamp: '2025-10-20T12:02:00Z',
      attachment_urls: ['https://cdn.discord.com/attachments/123/image.png']
    };

    const message = parser.parseMessage(messageData);

    expect(message.attachment_urls).toBeDefined();
    const urls = JSON.parse(message.attachment_urls!);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('image.png');
  });

  it('should handle missing optional fields', () => {
    const messageData = {
      id: 'msg_4',
      author_id: 'user_1',
      author_name: 'User1',
      timestamp: '2025-10-20T12:03:00Z'
    };

    const message = parser.parseMessage(messageData);

    expect(message.content).toBeUndefined();
    expect(message.reply_to_message_id).toBeUndefined();
    expect(message.attachment_urls).toBeUndefined();
  });

  it('should parse edited timestamp', () => {
    const messageData = {
      id: 'msg_5',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Edited message',
      timestamp: '2025-10-20T12:00:00Z',
      edited_timestamp: '2025-10-20T12:05:00Z'
    };

    const message = parser.parseMessage(messageData);

    expect(message.edited_timestamp).toBeInstanceOf(Date);
    expect(message.edited_timestamp!.getTime()).toBeGreaterThan(message.timestamp.getTime());
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- MessageParser.test.ts`
Expected: FAIL with "Cannot find module '../MessageParser'"

**Step 3: Write minimal implementation**

Create `src/domain/metadata-capture/MessageParser.ts`:
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
}

export class MessageParser {
  private channelId: string;

  constructor(channelId: string) {
    this.channelId = channelId;
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
      embed_data: data.embed_data ? JSON.stringify(data.embed_data) : undefined
    };

    return message;
  }

  parseMessages(dataArray: RawMessageData[]): Message[] {
    return dataArray.map(data => this.parseMessage(data));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- MessageParser.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/domain/metadata-capture/MessageParser.ts src/domain/metadata-capture/__tests__/MessageParser.test.ts
git commit -m "feat: add message parser

Implement message parser to convert raw Discord data to domain models."
```

---

### Task 7: Thread Reconstruction - Thread Analyzer

**Files:**
- Create: `src/domain/thread-reconstruction/ThreadAnalyzer.ts`
- Test: `src/domain/thread-reconstruction/__tests__/ThreadAnalyzer.test.ts`

**Step 1: Write the failing test**

Create `src/domain/thread-reconstruction/__tests__/ThreadAnalyzer.test.ts`:
```typescript
import { ThreadAnalyzer } from '../ThreadAnalyzer';
import { Message } from '../../models/types';
import DatabaseService from '../../../services/DatabaseService';

jest.mock('../../../services/DatabaseService');

describe('ThreadAnalyzer', () => {
  let analyzer: ThreadAnalyzer;
  let mockDb: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    mockDb = {
      getReplies: jest.fn()
    } as any;

    analyzer = new ThreadAnalyzer(mockDb);
  });

  it('should build thread tree from root message', () => {
    const rootMsg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Root message',
      timestamp: new Date(),
      messages_scraped: 0
    };

    const reply1: Message = {
      id: 'msg_2',
      channel_id: 'ch_1',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'First reply',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      messages_scraped: 0
    };

    const reply2: Message = {
      id: 'msg_3',
      channel_id: 'ch_1',
      author_id: 'user_3',
      author_name: 'User3',
      content: 'Reply to reply',
      timestamp: new Date(),
      reply_to_message_id: 'msg_2',
      messages_scraped: 0
    };

    mockDb.getReplies
      .mockReturnValueOnce([reply1])  // Replies to msg_1
      .mockReturnValueOnce([reply2])  // Replies to msg_2
      .mockReturnValueOnce([]);       // Replies to msg_3 (none)

    const tree = analyzer.buildThreadTree(rootMsg);

    expect(tree.message.id).toBe('msg_1');
    expect(tree.replies).toHaveLength(1);
    expect(tree.replies[0].message.id).toBe('msg_2');
    expect(tree.replies[0].replies).toHaveLength(1);
    expect(tree.replies[0].replies[0].message.id).toBe('msg_3');
  });

  it('should handle messages with no replies', () => {
    const msg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Standalone message',
      timestamp: new Date(),
      messages_scraped: 0
    };

    mockDb.getReplies.mockReturnValue([]);

    const tree = analyzer.buildThreadTree(msg);

    expect(tree.message.id).toBe('msg_1');
    expect(tree.replies).toHaveLength(0);
  });

  it('should calculate thread depth', () => {
    const rootMsg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Root',
      timestamp: new Date(),
      messages_scraped: 0
    };

    const reply1: Message = {
      id: 'msg_2',
      channel_id: 'ch_1',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'Reply1',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      messages_scraped: 0
    };

    const reply2: Message = {
      id: 'msg_3',
      channel_id: 'ch_1',
      author_id: 'user_3',
      author_name: 'User3',
      content: 'Reply2',
      timestamp: new Date(),
      reply_to_message_id: 'msg_2',
      messages_scraped: 0
    };

    mockDb.getReplies
      .mockReturnValueOnce([reply1])
      .mockReturnValueOnce([reply2])
      .mockReturnValueOnce([]);

    const tree = analyzer.buildThreadTree(rootMsg);
    const depth = analyzer.getThreadDepth(tree);

    expect(depth).toBe(3);
  });

  it('should count total messages in thread', () => {
    const rootMsg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Root',
      timestamp: new Date(),
      messages_scraped: 0
    };

    const reply1: Message = {
      id: 'msg_2',
      channel_id: 'ch_1',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'Reply1',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      messages_scraped: 0
    };

    const reply2: Message = {
      id: 'msg_3',
      channel_id: 'ch_1',
      author_id: 'user_3',
      author_name: 'User3',
      content: 'Reply2',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      messages_scraped: 0
    };

    mockDb.getReplies
      .mockReturnValueOnce([reply1, reply2])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const tree = analyzer.buildThreadTree(rootMsg);
    const count = analyzer.countThreadMessages(tree);

    expect(count).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- ThreadAnalyzer.test.ts`
Expected: FAIL with "Cannot find module '../ThreadAnalyzer'"

**Step 3: Write minimal implementation**

Create `src/domain/thread-reconstruction/ThreadAnalyzer.ts`:
```typescript
import { Message } from '../models/types';
import DatabaseService from '../../services/DatabaseService';

export interface MessageNode {
  message: Message;
  replies: MessageNode[];
}

export class ThreadAnalyzer {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  buildThreadTree(rootMessage: Message): MessageNode {
    const node: MessageNode = {
      message: rootMessage,
      replies: []
    };

    // Recursively get all replies
    const replies = this.db.getReplies(rootMessage.id);
    node.replies = replies.map(reply => this.buildThreadTree(reply));

    return node;
  }

  getThreadDepth(node: MessageNode): number {
    if (node.replies.length === 0) {
      return 1;
    }

    const childDepths = node.replies.map(reply => this.getThreadDepth(reply));
    return 1 + Math.max(...childDepths);
  }

  countThreadMessages(node: MessageNode): number {
    let count = 1; // Count this message

    for (const reply of node.replies) {
      count += this.countThreadMessages(reply);
    }

    return count;
  }

  flattenThread(node: MessageNode): Message[] {
    const messages: Message[] = [node.message];

    for (const reply of node.replies) {
      messages.push(...this.flattenThread(reply));
    }

    return messages;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- ThreadAnalyzer.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/domain/thread-reconstruction/ThreadAnalyzer.ts src/domain/thread-reconstruction/__tests__/ThreadAnalyzer.test.ts
git commit -m "feat: add thread analyzer

Implement thread tree builder with depth and message counting."
```

---

## Phase 3: API Layer

### Task 8: API Server Setup

**Files:**
- Create: `src/api/index.ts`
- Create: `src/api/routes/servers.ts`
- Create: `src/api/routes/channels.ts`
- Create: `src/api/routes/messages.ts`
- Create: `src/api/routes/threads.ts`
- Create: `src/api/routes/scrape.ts`
- Test: `src/api/__tests__/api.test.ts`

**Step 1: Write the API server setup**

Create `src/api/index.ts`:
```typescript
import { createApiServer, startServer } from '@myorg/api-server';
import serversRouter from './routes/servers';
import channelsRouter from './routes/channels';
import messagesRouter from './routes/messages';
import threadsRouter from './routes/threads';
import scrapeRouter from './routes/scrape';

const app = createApiServer({
  dbPath: './discord-scraper.db',
  enableLogging: process.env.NODE_ENV === 'development'
});

// Add domain routes
app.use('/api/servers', serversRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/threads', threadsRouter);
app.use('/api/scrape', scrapeRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

if (require.main === module) {
  startServer(app, PORT);
}

export default app;
```

**Step 2: Write server routes**

Create `src/api/routes/servers.ts`:
```typescript
import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';

const router = Router();
const db = new DatabaseService('./discord-scraper.db');

// GET /api/servers - List all servers
router.get('/', (req, res) => {
  try {
    const servers = db.getAllServers();
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// GET /api/servers/:id - Get server by ID
router.get('/:id', (req, res) => {
  try {
    const server = db.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch server' });
  }
});

// GET /api/servers/:id/channels - Get channels for server
router.get('/:id/channels', (req, res) => {
  try {
    const channels = db.getChannelsByServer(req.params.id);
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

export default router;
```

Create `src/api/routes/channels.ts`:
```typescript
import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';

const router = Router();
const db = new DatabaseService('./discord-scraper.db');

// GET /api/channels - List all channels (optionally filter by server)
router.get('/', (req, res) => {
  try {
    const serverId = req.query.server_id as string | undefined;

    if (serverId) {
      const channels = db.getChannelsByServer(serverId);
      res.json(channels);
    } else {
      // TODO: Implement getAllChannels if needed
      res.status(400).json({ error: 'server_id query parameter required' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /api/channels/:id - Get channel by ID
router.get('/:id', (req, res) => {
  try {
    const channel = db.getChannel(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

export default router;
```

Create `src/api/routes/messages.ts`:
```typescript
import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';

const router = Router();
const db = new DatabaseService('./discord-scraper.db');

// GET /api/messages/:channelId - Get messages for channel with pagination
router.get('/:channelId', (req, res) => {
  try {
    const channelId = req.params.channelId;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const messages = db.getMessagesByChannel(channelId, limit, offset);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;
```

Create `src/api/routes/threads.ts`:
```typescript
import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';
import { ThreadAnalyzer } from '../../domain/thread-reconstruction/ThreadAnalyzer';

const router = Router();
const db = new DatabaseService('./discord-scraper.db');
const analyzer = new ThreadAnalyzer(db);

// GET /api/threads/:messageId - Get conversation thread from message
router.get('/:messageId', (req, res) => {
  try {
    const message = db.getMessage(req.params.messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const tree = analyzer.buildThreadTree(message);
    const depth = analyzer.getThreadDepth(tree);
    const messageCount = analyzer.countThreadMessages(tree);

    res.json({
      tree,
      depth,
      messageCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build thread' });
  }
});

export default router;
```

Create `src/api/routes/scrape.ts`:
```typescript
import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';

const router = Router();
const db = new DatabaseService('./discord-scraper.db');

// POST /api/scrape/start - Start scrape job
router.post('/start', (req, res) => {
  try {
    const { channel_id, scrape_type } = req.body;

    if (!channel_id || !scrape_type) {
      return res.status(400).json({ error: 'channel_id and scrape_type required' });
    }

    if (scrape_type !== 'full' && scrape_type !== 'incremental') {
      return res.status(400).json({ error: 'scrape_type must be "full" or "incremental"' });
    }

    const jobId = db.createScrapeJob(channel_id, scrape_type);
    res.json({ jobId, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create scrape job' });
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

    // TODO: Set resumed_from_job_id (need to add this to createScrapeJob or update separately)

    res.json({ jobId: newJobId, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

export default router;
```

**Step 3: Write integration test**

Create `src/api/__tests__/api.test.ts`:
```typescript
import request from 'supertest';
import app from '../index';
import DatabaseService from '../../services/DatabaseService';
import * as fs from 'fs';

const TEST_DB = './test-api.db';

describe('API Integration Tests', () => {
  let db: DatabaseService;

  beforeAll(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    db = new DatabaseService(TEST_DB);
    db.initialize();

    // Seed test data
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({ id: 'channel_1', server_id: 'server_1', name: 'general', message_count: 0 });
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/servers', () => {
    it('should list all servers', async () => {
      const res = await request(app).get('/api/servers');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Test Server');
    });
  });

  describe('POST /api/scrape/start', () => {
    it('should create scrape job', async () => {
      const res = await request(app)
        .post('/api/scrape/start')
        .send({ channel_id: 'channel_1', scrape_type: 'full' });

      expect(res.status).toBe(200);
      expect(res.body.jobId).toBeGreaterThan(0);
      expect(res.body.status).toBe('pending');
    });

    it('should reject invalid scrape_type', async () => {
      const res = await request(app)
        .post('/api/scrape/start')
        .send({ channel_id: 'channel_1', scrape_type: 'invalid' });

      expect(res.status).toBe(400);
    });
  });
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- api.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/api/
git commit -m "feat: add API routes for servers, channels, messages, threads, scrape

Implement complete REST API using @myorg/api-server with integration tests."
```

---

## Phase 4: CLI Tools

### Task 9: Database Initialization CLI

**Files:**
- Create: `src/cli/init-db.ts`

**Step 1: Write the CLI tool**

Create `src/cli/init-db.ts`:
```typescript
#!/usr/bin/env node

import DatabaseService from '../services/DatabaseService';
import * as path from 'path';

const DB_PATH = path.join(process.cwd(), 'discord-scraper.db');

console.log('Initializing Discord Scraper database...');
console.log(`Database path: ${DB_PATH}`);

try {
  const db = new DatabaseService(DB_PATH);
  db.initialize();
  db.close();

  console.log('✓ Database initialized successfully');
  console.log('  - Tables created: servers, channels, messages, scrape_jobs');
  console.log('  - Indexes created for performance');
} catch (error) {
  console.error('✗ Failed to initialize database:', error);
  process.exit(1);
}
```

**Step 2: Test manually**

Run: `npm run init-db`
Expected: Database file created, success message printed

**Step 3: Commit**

```bash
git add src/cli/init-db.ts
git commit -m "feat: add database initialization CLI

Add command to create SQLite database schema."
```

---

### Task 10: Config Validation CLI

**Files:**
- Create: `src/cli/validate-config.ts`

**Step 1: Write the CLI tool**

Create `src/cli/validate-config.ts`:
```typescript
#!/usr/bin/env node

import ConfigLoader from '../config/ConfigLoader';
import * as path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'discord-config.yaml');

console.log('Validating Discord Scraper configuration...');
console.log(`Config path: ${CONFIG_PATH}`);

try {
  const config = ConfigLoader.load(CONFIG_PATH);

  console.log('✓ Configuration is valid');
  console.log(`  - Servers: ${config.servers.length}`);

  let totalChannels = 0;
  for (const server of config.servers) {
    console.log(`    - ${server.name}: ${server.channels.length} channels`);
    totalChannels += server.channels.length;
  }

  console.log(`  - Total channels: ${totalChannels}`);
  console.log(`  - Cookies file: ${config.auth.cookies_file}`);
  console.log(`  - Headless mode: ${config.scraping.headless}`);
} catch (error) {
  console.error('✗ Configuration validation failed:');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
```

**Step 2: Test manually**

Run: `npm run validate-config`
Expected: Validation success or clear error message

**Step 3: Commit**

```bash
git add src/cli/validate-config.ts
git commit -m "feat: add config validation CLI

Add command to validate discord-config.yaml structure."
```

---

### Task 11: Authentication Setup CLI

**Files:**
- Create: `src/cli/auth-setup.ts`

**Step 1: Write the CLI tool**

Create `src/cli/auth-setup.ts`:
```typescript
#!/usr/bin/env node

import { DiscordBrowserController } from '../domain/scrape-engine/DiscordBrowserController';
import ConfigLoader from '../config/ConfigLoader';
import * as path from 'path';
import * as readline from 'readline';

const CONFIG_PATH = path.join(process.cwd(), 'discord-config.yaml');

async function waitForUserInput(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log('Discord Authentication Setup');
  console.log('============================\n');

  // Load config to get cookies path
  let config;
  try {
    config = ConfigLoader.load(CONFIG_PATH);
  } catch (error) {
    console.error('Failed to load config:', error);
    process.exit(1);
  }

  const cookiesPath = path.join(process.cwd(), config.auth.cookies_file);

  console.log('This will launch a visible browser window.');
  console.log('Please log into Discord manually.');
  console.log('Once logged in, press Enter to save cookies.\n');

  const controller = new DiscordBrowserController(false); // Visible browser

  try {
    await controller.launch();
    console.log('Browser launched. Navigating to Discord...\n');

    // Navigate to Discord homepage
    const page = controller.getPage();
    await page.goto('https://discord.com/login', { waitUntil: 'networkidle' });

    console.log('Please log in to Discord in the browser window.');
    await waitForUserInput('Press Enter once you are logged in... ');

    // Save cookies
    await controller.saveCookiesToFile(cookiesPath);
    console.log(`\n✓ Cookies saved to ${cookiesPath}`);
    console.log('  You can now run scraping operations.');

    await controller.close();
  } catch (error) {
    console.error('\n✗ Authentication setup failed:', error);
    await controller.close();
    process.exit(1);
  }
}

main();
```

**Step 2: Test manually**

Run: `npm run auth-setup`
Expected: Browser opens, user logs in, cookies saved

**Step 3: Commit**

```bash
git add src/cli/auth-setup.ts
git commit -m "feat: add authentication setup CLI

Add command to perform manual Discord login and save cookies."
```

---

## Phase 5: Integration & Testing

### Task 12: End-to-End Scraping Test

**Files:**
- Create: `src/__tests__/e2e-scrape.test.ts`

**Step 1: Write E2E test (mocked Playwright)**

Create `src/__tests__/e2e-scrape.test.ts`:
```typescript
import DatabaseService from '../services/DatabaseService';
import { DiscordBrowserController } from '../domain/scrape-engine/DiscordBrowserController';
import { MessageParser } from '../domain/metadata-capture/MessageParser';
import * as fs from 'fs';

jest.mock('../domain/scrape-engine/DiscordBrowserController');

const TEST_DB = './test-e2e.db';

describe('End-to-End Scraping', () => {
  let db: DatabaseService;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    db = new DatabaseService(TEST_DB);
    db.initialize();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  it('should complete full scraping workflow', async () => {
    // Setup
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({ id: 'channel_1', server_id: 'server_1', name: 'general', message_count: 0 });

    // Create scrape job
    const jobId = db.createScrapeJob('channel_1', 'full');
    expect(jobId).toBeGreaterThan(0);

    // Update job to running
    db.updateScrapeJobStatus(jobId, 'running');

    // Simulate parsing messages
    const parser = new MessageParser('channel_1');
    const mockMessages = [
      {
        id: 'msg_1',
        author_id: 'user_1',
        author_name: 'User1',
        content: 'Hello',
        timestamp: new Date().toISOString()
      },
      {
        id: 'msg_2',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'Reply',
        timestamp: new Date().toISOString(),
        reply_to_message_id: 'msg_1'
      }
    ];

    for (const msgData of mockMessages) {
      const message = parser.parseMessage(msgData);
      db.insertMessage(message);
      db.incrementMessagesScraped(jobId, 1);
    }

    // Complete job
    db.updateScrapeJobStatus(jobId, 'completed');

    // Verify results
    const job = db.getScrapeJob(jobId);
    expect(job?.status).toBe('completed');
    expect(job?.messages_scraped).toBe(2);

    const messages = db.getMessagesByChannel('channel_1');
    expect(messages).toHaveLength(2);

    const replies = db.getReplies('msg_1');
    expect(replies).toHaveLength(1);
    expect(replies[0].id).toBe('msg_2');
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npm test -- e2e-scrape.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/e2e-scrape.test.ts
git commit -m "test: add end-to-end scraping test

Add integration test covering full scraping workflow from job creation
to message storage and thread relationships."
```

---

## Phase 6: Documentation & Final Setup

### Task 13: Project README

**Files:**
- Create: `README.md`

**Step 1: Write comprehensive README**

Create `README.md`:
```markdown
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README

Add installation, configuration, usage, and API documentation."
```

---

### Task 14: Jest Configuration

**Files:**
- Create: `jest.config.js`

**Step 1: Write Jest config**

Create `jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
```

**Step 2: Commit**

```bash
git add jest.config.js
git commit -m "test: add Jest configuration

Configure Jest with TypeScript support and path aliases."
```

---

## Execution Summary

**Plan saved to:** `docs/plans/2025-10-20-discord-scraper-implementation.md`

**Implementation phases:**
1. ✅ Foundation (Models, Database, Config) - 3 tasks
2. ✅ Domain Capabilities (Scrape Engine, Parsers, Threads) - 4 tasks
3. ✅ API Layer (Routes, Integration) - 1 task
4. ✅ CLI Tools (Init, Validate, Auth) - 3 tasks
5. ✅ Integration & Testing (E2E) - 1 task
6. ✅ Documentation (README, Jest) - 2 tasks

**Total tasks:** 14 bite-sized tasks with TDD approach

**What's NOT in this plan:**
- Frontend implementation (React dashboard components)
- Actual DOM scraping logic (Discord-specific selectors)
- Background worker for scrape job processing
- Real Playwright integration (currently mocked in tests)

These can be implemented in a follow-up plan after the foundation is solid.
