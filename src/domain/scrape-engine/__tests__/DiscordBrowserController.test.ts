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
