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
      embed_data: row.embed_data,
      message_url: row.message_url,
      has_attachments: row.has_attachments === 1,
      has_embeds: row.has_embeds === 1
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
