import { MessageScroller } from '../MessageScroller';
import { Page } from 'playwright';

describe('MessageScroller', () => {
  let mockPage: jest.Mocked<Page>;
  let scroller: MessageScroller;

  beforeEach(() => {
    mockPage = {
      evaluate: jest.fn(),
      waitForTimeout: jest.fn(),
      waitForSelector: jest.fn()
    } as any;

    scroller = new MessageScroller(mockPage, 1000);
  });

  describe('scrollUp', () => {
    it('should scroll up and return false when not at top', async () => {
      // scrollUp calls: getCurrentScrollPosition (1 evaluate), scroll action (1 evaluate), getCurrentScrollPosition (1 evaluate)
      mockPage.evaluate
        .mockResolvedValueOnce(1000) // Before scroll position (getCurrentScrollPosition)
        .mockResolvedValueOnce(undefined) // Scroll action (no return value)
        .mockResolvedValueOnce(500);  // After scroll position (getCurrentScrollPosition)

      const atTop = await scroller.scrollUp();

      expect(atTop).toBe(false);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(3);
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
    });

    it('should detect when at top (scroll position unchanged)', async () => {
      mockPage.evaluate
        .mockResolvedValueOnce(0)        // Before scroll position
        .mockResolvedValueOnce(undefined) // Scroll action
        .mockResolvedValueOnce(0);       // After scroll position (unchanged - at top)

      const atTop = await scroller.scrollUp();

      expect(atTop).toBe(true);
    });

    it('should detect when scroll position stops changing', async () => {
      // Simulate being near top where scroll position doesn't change
      mockPage.evaluate
        .mockResolvedValueOnce(100)       // Before scroll
        .mockResolvedValueOnce(undefined) // Scroll action
        .mockResolvedValueOnce(100);      // After scroll (unchanged)

      const atTop = await scroller.scrollUp();

      expect(atTop).toBe(true);
    });
  });

  describe('getCurrentScrollPosition', () => {
    it('should get current scroll position', async () => {
      mockPage.evaluate.mockResolvedValue(500);

      const position = await scroller.getCurrentScrollPosition();

      expect(position).toBe(500);
      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should return 0 when scroller element not found', async () => {
      mockPage.evaluate.mockResolvedValue(0);

      const position = await scroller.getCurrentScrollPosition();

      expect(position).toBe(0);
    });
  });

  describe('waitForMessages', () => {
    it('should wait for message elements to load', async () => {
      mockPage.waitForSelector.mockResolvedValue(null as any);

      await scroller.waitForMessages();

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '[class*="message"]',
        { timeout: 10000 }
      );
    });
  });

  describe('scrollToBottom', () => {
    it('should scroll to bottom if needed', async () => {
      mockPage.evaluate.mockResolvedValue(undefined);

      await scroller.scrollToBottom();

      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });

  describe('scrolling workflow', () => {
    it('should support multiple scroll up operations until at top', async () => {
      // Simulate scrolling up multiple times until reaching top
      // Each scrollUp: before position, scroll action, after position
      mockPage.evaluate
        .mockResolvedValueOnce(2000).mockResolvedValueOnce(undefined).mockResolvedValueOnce(1500) // First scrollUp: not at top
        .mockResolvedValueOnce(1500).mockResolvedValueOnce(undefined).mockResolvedValueOnce(1000) // Second scrollUp: not at top
        .mockResolvedValueOnce(1000).mockResolvedValueOnce(undefined).mockResolvedValueOnce(500)  // Third scrollUp: not at top
        .mockResolvedValueOnce(500).mockResolvedValueOnce(undefined).mockResolvedValueOnce(0)     // Fourth scrollUp: not at top
        .mockResolvedValueOnce(0).mockResolvedValueOnce(undefined).mockResolvedValueOnce(0);      // Fifth scrollUp: at top!

      expect(await scroller.scrollUp()).toBe(false);
      expect(await scroller.scrollUp()).toBe(false);
      expect(await scroller.scrollUp()).toBe(false);
      expect(await scroller.scrollUp()).toBe(false);
      expect(await scroller.scrollUp()).toBe(true);
    });
  });
});
