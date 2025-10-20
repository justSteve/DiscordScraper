import { Page } from 'playwright';

/**
 * MessageScroller handles scrolling logic for Discord channels.
 *
 * IMPROVED STRATEGY:
 * - Start from current view (newest messages already visible)
 * - Scroll up repeatedly to load older messages
 * - Detect when at top (scroll position stops changing)
 *
 * This is more efficient than the original plan which suggested
 * scrolling to bottom first, then scrolling up.
 */
export class MessageScroller {
  private page: Page;
  private scrollDelayMs: number;
  private lastScrollPosition: number = -1;

  constructor(page: Page, scrollDelayMs: number = 1500) {
    this.page = page;
    this.scrollDelayMs = scrollDelayMs;
  }

  /**
   * Scroll up in the Discord channel and detect if we've reached the top.
   * @returns true if at top (scroll position unchanged), false otherwise
   */
  async scrollUp(): Promise<boolean> {
    const beforeScroll = await this.getCurrentScrollPosition();

    // Scroll up by viewport height
    await this.page.evaluate(() => {
      const scroller = document.querySelector('[class*="scrollerInner"]');
      if (scroller) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop - window.innerHeight);
      }
    });

    await this.page.waitForTimeout(this.scrollDelayMs);

    const afterScroll = await this.getCurrentScrollPosition();

    // If scroll position didn't change, we're at the top
    const atTop = beforeScroll === afterScroll;

    this.lastScrollPosition = afterScroll;
    return atTop;
  }

  /**
   * Get the current scroll position of the Discord channel.
   * @returns Current scrollTop value
   */
  async getCurrentScrollPosition(): Promise<number> {
    return await this.page.evaluate(() => {
      const scroller = document.querySelector('[class*="scrollerInner"]');
      return scroller ? scroller.scrollTop : 0;
    });
  }

  /**
   * Wait for message elements to load in the DOM.
   */
  async waitForMessages(): Promise<void> {
    await this.page.waitForSelector('[class*="message"]', { timeout: 10000 });
  }

  /**
   * Scroll to the bottom of the channel (optional, for full scrapes if needed).
   * This is kept for compatibility but the improved strategy starts from current view.
   */
  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => {
      const scroller = document.querySelector('[class*="scrollerInner"]');
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    await this.page.waitForTimeout(this.scrollDelayMs);
  }
}
