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
