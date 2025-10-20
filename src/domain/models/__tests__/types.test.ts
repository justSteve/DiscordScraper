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
      reply_to_message_id: 'msg_788',
      message_url: 'https://discord.com/channels/server_123/channel_456/msg_789',
      has_attachments: false,
      has_embeds: false
    };
    expect(message.reply_to_message_id).toBe('msg_788');
    expect(message.message_url).toBe('https://discord.com/channels/server_123/channel_456/msg_789');
    expect(message.has_attachments).toBe(false);
    expect(message.has_embeds).toBe(false);
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
