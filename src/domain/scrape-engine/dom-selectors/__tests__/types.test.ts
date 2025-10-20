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
