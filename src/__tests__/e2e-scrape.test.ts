import DatabaseService from '../services/DatabaseService';
import { DiscordBrowserController } from '../domain/scrape-engine/DiscordBrowserController';
import { MessageParser } from '../domain/metadata-capture/MessageParser';
import { ThreadAnalyzer } from '../domain/thread-reconstruction/ThreadAnalyzer';
import * as fs from 'fs';

jest.mock('../domain/scrape-engine/DiscordBrowserController');

const TEST_DB = './test-e2e.db';

describe('End-to-End Scraping Workflow', () => {
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

  it('should complete full scraping workflow: job creation -> parsing -> storage -> thread reconstruction', async () => {
    // Step 1: Setup - Create server and channel in database
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({
      id: 'channel_1',
      server_id: 'server_1',
      name: 'general',
      message_count: 0
    });

    // Step 2: Create scrape job
    const jobId = db.createScrapeJob('channel_1', 'full');
    expect(jobId).toBeGreaterThan(0);

    const initialJob = db.getScrapeJob(jobId);
    expect(initialJob?.status).toBe('pending');
    expect(initialJob?.scrape_type).toBe('full');
    expect(initialJob?.messages_scraped).toBe(0);

    // Step 3: Update job to running status
    db.updateScrapeJobStatus(jobId, 'running');

    // Step 4: Simulate parsing messages with MessageParser
    const parser = new MessageParser('channel_1', 'server_1');

    // Create mock message data (simulating what would come from browser scraping)
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
      {
        id: 'msg_2',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'This is a reply to the first message',
        timestamp: new Date('2025-10-20T10:01:00Z').toISOString(),
        reply_to_message_id: 'msg_1',
        has_attachments: false,
        has_embeds: false
      },
      {
        id: 'msg_3',
        author_id: 'user_3',
        author_name: 'User3',
        content: 'This is a reply to the reply',
        timestamp: new Date('2025-10-20T10:02:00Z').toISOString(),
        reply_to_message_id: 'msg_2',
        has_attachments: false,
        has_embeds: false
      },
      {
        id: 'msg_4',
        author_id: 'user_1',
        author_name: 'User1',
        content: 'Another top-level message',
        timestamp: new Date('2025-10-20T10:03:00Z').toISOString(),
        has_attachments: false,
        has_embeds: false
      }
    ];

    // Step 5: Parse and insert messages into database
    for (const msgData of mockMessages) {
      const message = parser.parseMessage(msgData);
      db.insertMessage(message);
      db.incrementMessagesScraped(jobId, 1);
    }

    // Step 6: Complete the scrape job
    db.updateScrapeJobStatus(jobId, 'completed');

    // Verification 1: Check job status
    const completedJob = db.getScrapeJob(jobId);
    expect(completedJob?.status).toBe('completed');
    expect(completedJob?.messages_scraped).toBe(4);
    expect(completedJob?.completed_at).toBeDefined();

    // Verification 2: Check messages were stored correctly
    const messages = db.getMessagesByChannel('channel_1');
    expect(messages).toHaveLength(4);

    // Messages should be sorted by timestamp DESC
    expect(messages[0].id).toBe('msg_4'); // Most recent
    expect(messages[3].id).toBe('msg_1'); // Oldest

    // Verification 3: Check reply relationships
    const repliesTo1 = db.getReplies('msg_1');
    expect(repliesTo1).toHaveLength(1);
    expect(repliesTo1[0].id).toBe('msg_2');

    const repliesTo2 = db.getReplies('msg_2');
    expect(repliesTo2).toHaveLength(1);
    expect(repliesTo2[0].id).toBe('msg_3');

    const repliesTo3 = db.getReplies('msg_3');
    expect(repliesTo3).toHaveLength(0); // No replies

    const repliesTo4 = db.getReplies('msg_4');
    expect(repliesTo4).toHaveLength(0); // No replies

    // Step 7: Test thread reconstruction with ThreadAnalyzer
    const analyzer = new ThreadAnalyzer(db);

    // Build thread tree from root message
    const rootMessage = db.getMessage('msg_1');
    expect(rootMessage).toBeDefined();

    const threadTree = analyzer.buildThreadTree(rootMessage!);

    // Verification 4: Check thread tree structure
    expect(threadTree.message.id).toBe('msg_1');
    expect(threadTree.replies).toHaveLength(1);
    expect(threadTree.replies[0].message.id).toBe('msg_2');
    expect(threadTree.replies[0].replies).toHaveLength(1);
    expect(threadTree.replies[0].replies[0].message.id).toBe('msg_3');
    expect(threadTree.replies[0].replies[0].replies).toHaveLength(0);

    // Verification 5: Check thread depth calculation
    const threadDepth = analyzer.getThreadDepth(threadTree);
    expect(threadDepth).toBe(3); // msg_1 -> msg_2 -> msg_3

    // Verification 6: Check thread message count
    const messageCount = analyzer.countThreadMessages(threadTree);
    expect(messageCount).toBe(3); // msg_1, msg_2, msg_3

    // Verification 7: Check flatten thread functionality
    const flattenedMessages = analyzer.flattenThread(threadTree);
    expect(flattenedMessages).toHaveLength(3);
    expect(flattenedMessages.map(m => m.id)).toEqual(['msg_1', 'msg_2', 'msg_3']);
  });

  it('should handle duplicate message insertions gracefully', () => {
    // Setup
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({
      id: 'channel_1',
      server_id: 'server_1',
      name: 'general',
      message_count: 0
    });

    const parser = new MessageParser('channel_1', 'server_1');
    const messageData = {
      id: 'msg_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Test message',
      timestamp: new Date().toISOString(),
      has_attachments: false,
      has_embeds: false
    };

    // Insert same message twice
    const message = parser.parseMessage(messageData);
    db.insertMessage(message);
    db.insertMessage(message); // Duplicate - should be ignored

    // Verify only one message exists
    const messages = db.getMessagesByChannel('channel_1');
    expect(messages).toHaveLength(1);
  });

  it('should support incremental scraping workflow', () => {
    // Setup
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({
      id: 'channel_1',
      server_id: 'server_1',
      name: 'general',
      message_count: 0
    });

    // First scrape: full
    const job1 = db.createScrapeJob('channel_1', 'full');
    db.updateScrapeJobStatus(job1, 'running');

    const parser = new MessageParser('channel_1', 'server_1');
    const initialMessages = [
      {
        id: 'msg_1',
        author_id: 'user_1',
        author_name: 'User1',
        content: 'Initial message',
        timestamp: new Date('2025-10-20T10:00:00Z').toISOString(),
        has_attachments: false,
        has_embeds: false
      }
    ];

    initialMessages.forEach(msgData => {
      const message = parser.parseMessage(msgData);
      db.insertMessage(message);
      db.incrementMessagesScraped(job1, 1);
    });

    db.updateScrapeJobStatus(job1, 'completed');

    // Second scrape: incremental
    const job2 = db.createScrapeJob('channel_1', 'incremental');
    expect(db.getScrapeJob(job2)?.scrape_type).toBe('incremental');

    db.updateScrapeJobStatus(job2, 'running');

    const newMessages = [
      {
        id: 'msg_2',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'New message after initial scrape',
        timestamp: new Date('2025-10-20T11:00:00Z').toISOString(),
        has_attachments: false,
        has_embeds: false
      }
    ];

    newMessages.forEach(msgData => {
      const message = parser.parseMessage(msgData);
      db.insertMessage(message);
      db.incrementMessagesScraped(job2, 1);
    });

    db.updateScrapeJobStatus(job2, 'completed');

    // Verify both jobs completed
    expect(db.getScrapeJob(job1)?.status).toBe('completed');
    expect(db.getScrapeJob(job1)?.messages_scraped).toBe(1);
    expect(db.getScrapeJob(job2)?.status).toBe('completed');
    expect(db.getScrapeJob(job2)?.messages_scraped).toBe(1);

    // Verify all messages are in database
    const allMessages = db.getMessagesByChannel('channel_1');
    expect(allMessages).toHaveLength(2);
  });

  it('should handle scrape job failures with error messages', () => {
    // Setup
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({
      id: 'channel_1',
      server_id: 'server_1',
      name: 'general',
      message_count: 0
    });

    // Create job and simulate failure
    const jobId = db.createScrapeJob('channel_1', 'full');
    db.updateScrapeJobStatus(jobId, 'running');
    db.updateScrapeJobStatus(jobId, 'failed', 'Network timeout');

    const failedJob = db.getScrapeJob(jobId);
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error_message).toBe('Network timeout');
    expect(failedJob?.completed_at).toBeDefined();
  });

  it('should build complex thread trees with multiple branches', () => {
    // Setup
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({
      id: 'channel_1',
      server_id: 'server_1',
      name: 'general',
      message_count: 0
    });

    const parser = new MessageParser('channel_1', 'server_1');

    // Create a tree structure:
    //     msg_1
    //      /  \
    //   msg_2 msg_3
    //     |
    //   msg_4

    const messages = [
      {
        id: 'msg_1',
        author_id: 'user_1',
        author_name: 'User1',
        content: 'Root',
        timestamp: new Date('2025-10-20T10:00:00Z').toISOString(),
        has_attachments: false,
        has_embeds: false
      },
      {
        id: 'msg_2',
        author_id: 'user_2',
        author_name: 'User2',
        content: 'Branch 1',
        timestamp: new Date('2025-10-20T10:01:00Z').toISOString(),
        reply_to_message_id: 'msg_1',
        has_attachments: false,
        has_embeds: false
      },
      {
        id: 'msg_3',
        author_id: 'user_3',
        author_name: 'User3',
        content: 'Branch 2',
        timestamp: new Date('2025-10-20T10:02:00Z').toISOString(),
        reply_to_message_id: 'msg_1',
        has_attachments: false,
        has_embeds: false
      },
      {
        id: 'msg_4',
        author_id: 'user_4',
        author_name: 'User4',
        content: 'Nested reply',
        timestamp: new Date('2025-10-20T10:03:00Z').toISOString(),
        reply_to_message_id: 'msg_2',
        has_attachments: false,
        has_embeds: false
      }
    ];

    messages.forEach(msgData => {
      const message = parser.parseMessage(msgData);
      db.insertMessage(message);
    });

    // Build and verify thread tree
    const analyzer = new ThreadAnalyzer(db);
    const rootMessage = db.getMessage('msg_1');
    const tree = analyzer.buildThreadTree(rootMessage!);

    // Verify tree structure
    expect(tree.message.id).toBe('msg_1');
    expect(tree.replies).toHaveLength(2); // Two branches

    // Find the branches (order might vary)
    const branch1 = tree.replies.find(r => r.message.id === 'msg_2');
    const branch2 = tree.replies.find(r => r.message.id === 'msg_3');

    expect(branch1).toBeDefined();
    expect(branch2).toBeDefined();

    // Branch 1 should have a nested reply
    expect(branch1!.replies).toHaveLength(1);
    expect(branch1!.replies[0].message.id).toBe('msg_4');

    // Branch 2 should have no replies
    expect(branch2!.replies).toHaveLength(0);

    // Verify depth (longest path is msg_1 -> msg_2 -> msg_4)
    const depth = analyzer.getThreadDepth(tree);
    expect(depth).toBe(3);

    // Verify total message count
    const count = analyzer.countThreadMessages(tree);
    expect(count).toBe(4);
  });
});
