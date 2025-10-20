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
