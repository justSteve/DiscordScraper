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
        message_url: 'https://discord.com/channels/server_1/channel_1/msg_1',
        has_attachments: false,
        has_embeds: false
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
        message_url: 'https://discord.com/channels/server_1/channel_1/msg_1',
        has_attachments: false,
        has_embeds: false
      };

      const msg2: Message = {
        id: 'msg_2',
        channel_id: 'channel_1',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'Reply to first',
        timestamp: new Date(),
        reply_to_message_id: 'msg_1',
        message_url: 'https://discord.com/channels/server_1/channel_1/msg_2',
        has_attachments: false,
        has_embeds: false
      };

      db.insertMessage(msg1);
      db.insertMessage(msg2);

      const replies = db.getReplies('msg_1');
      expect(replies).toHaveLength(1);
      expect(replies[0].id).toBe('msg_2');
    });

    it('should prevent same message ID across different channels', () => {
      db.insertChannel({ id: 'channel_2', server_id: 'server_1', name: 'random', message_count: 0 });

      const msg1: Message = {
        id: 'msg_1',
        channel_id: 'channel_1',
        author_id: 'user_1',
        author_name: 'User1',
        content: 'Message in channel 1',
        timestamp: new Date(),
        message_url: 'https://discord.com/channels/server_1/channel_1/msg_1',
        has_attachments: false,
        has_embeds: false
      };

      const msg2: Message = {
        id: 'msg_1',  // Same ID, different channel
        channel_id: 'channel_2',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'Attempt to use same ID in channel 2',
        timestamp: new Date(),
        message_url: 'https://discord.com/channels/server_1/channel_2/msg_1',
        has_attachments: false,
        has_embeds: false
      };

      db.insertMessage(msg1);
      db.insertMessage(msg2);  // Should be ignored due to unique constraint

      const channel1Messages = db.getMessagesByChannel('channel_1');
      const channel2Messages = db.getMessagesByChannel('channel_2');

      expect(channel1Messages).toHaveLength(1);
      expect(channel2Messages).toHaveLength(0);  // Second insert ignored
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
