import { MessageParser } from '../MessageParser';
import { Message } from '../../models/types';

describe('MessageParser', () => {
  let parser: MessageParser;

  beforeEach(() => {
    parser = new MessageParser('channel_123', 'server_456');
  });

  it('should parse a basic message', () => {
    const messageData = {
      id: 'msg_1',
      author_id: 'user_1',
      author_name: 'TestUser',
      content: 'Hello world',
      timestamp: '2025-10-20T12:00:00Z',
      has_attachments: false,
      has_embeds: false
    };

    const message = parser.parseMessage(messageData);

    expect(message.id).toBe('msg_1');
    expect(message.channel_id).toBe('channel_123');
    expect(message.author_name).toBe('TestUser');
    expect(message.content).toBe('Hello world');
    expect(message.timestamp).toBeInstanceOf(Date);
    expect(message.message_url).toBe('https://discord.com/channels/server_456/channel_123/msg_1');
    expect(message.has_attachments).toBe(false);
    expect(message.has_embeds).toBe(false);
  });

  it('should parse message with reply', () => {
    const messageData = {
      id: 'msg_2',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'Reply here',
      timestamp: '2025-10-20T12:01:00Z',
      reply_to_message_id: 'msg_1',
      has_attachments: false,
      has_embeds: false
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
      attachment_urls: ['https://cdn.discord.com/attachments/123/image.png'],
      has_attachments: true,
      has_embeds: false
    };

    const message = parser.parseMessage(messageData);

    expect(message.attachment_urls).toBeDefined();
    const urls = JSON.parse(message.attachment_urls!);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('image.png');
    expect(message.has_attachments).toBe(true);
  });

  it('should handle missing optional fields', () => {
    const messageData = {
      id: 'msg_4',
      author_id: 'user_1',
      author_name: 'User1',
      timestamp: '2025-10-20T12:03:00Z',
      has_attachments: false,
      has_embeds: false
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
      edited_timestamp: '2025-10-20T12:05:00Z',
      has_attachments: false,
      has_embeds: false
    };

    const message = parser.parseMessage(messageData);

    expect(message.edited_timestamp).toBeInstanceOf(Date);
    expect(message.edited_timestamp!.getTime()).toBeGreaterThan(message.timestamp.getTime());
  });

  it('should construct message_url from server, channel, and message IDs', () => {
    const messageData = {
      id: 'msg_789',
      author_id: 'user_1',
      author_name: 'TestUser',
      content: 'Test message',
      timestamp: '2025-10-20T10:00:00Z',
      has_attachments: false,
      has_embeds: false
    };

    const message = parser.parseMessage(messageData);

    expect(message.message_url).toBe('https://discord.com/channels/server_456/channel_123/msg_789');
  });

  it('should include has_attachments and has_embeds flags', () => {
    const messageData = {
      id: 'msg_789',
      author_id: 'user_1',
      author_name: 'TestUser',
      timestamp: '2025-10-20T10:00:00Z',
      has_attachments: true,
      has_embeds: true
    };

    const message = parser.parseMessage(messageData);

    expect(message.has_attachments).toBe(true);
    expect(message.has_embeds).toBe(true);
  });
});
