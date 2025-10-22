import { Page } from 'playwright';
import { RawMessageData } from './types';

/**
 * Discord DOM Extractor - Version 1
 *
 * Extracts message data from Discord's DOM using CSS selectors.
 * This version is designed to be easily replaceable when Discord updates their UI.
 *
 * CSS Selector Strategy:
 * - Uses Discord's class patterns (e.g., [class*="message"])
 * - Brittle by design - expect breakage on Discord updates
 * - When selectors break, create v2 and swap imports
 */
export class DiscordDOMExtractorV1 {
  /**
   * Extract all visible messages from the current page view.
   *
   * @param page - Playwright Page object positioned on Discord channel
   * @returns Array of raw message data extracted from DOM
   */
  async extractMessages(page: Page): Promise<RawMessageData[]> {
    // Use page.$$eval to run extraction logic in browser context
    // Updated selector: look for li elements within the messages list
    const messages = await page.$$eval('ol[data-list-id="chat-messages"] > li', (messageElements) => {
      return messageElements.map((el: Element) => {
        // Extract message ID from div with id starting with "message-content-" or "chat-messages-"
        const contentDiv = el.querySelector('[id^="message-content-"]') || el.querySelector('[id^="chat-messages-"]');
        const id = contentDiv?.getAttribute('id')?.replace('message-content-', '').replace('chat-messages-', '') || '';

        // Extract author information - username span
        const authorEl = el.querySelector('[class*="username"]');
        const authorName = authorEl?.textContent?.trim() || '';
        // Try data-text attribute for @mentions or textContent
        const authorNameFallback = authorEl?.getAttribute('data-text')?.replace('@', '') || authorName;
        const authorId = authorEl?.getAttribute('data-user-id') || '';

        // Extract avatar - look for img tag or background image
        const avatarEl = el.querySelector('[class*="avatar"] img');
        const authorAvatarUrl = avatarEl?.getAttribute('src') || undefined;

        // Extract message content - look for messageContent class
        const contentEl = el.querySelector('[class*="messageContent"]');
        const content = contentEl?.textContent?.trim() || undefined;

        // Extract timestamp
        const timeEl = el.querySelector('time');
        const timestamp = timeEl?.getAttribute('datetime') || new Date().toISOString();

        // Check for reply reference
        const replyEl = el.querySelector('[class*="repliedMessage"]');
        const replyToMessageId = replyEl?.getAttribute('data-message-id') || undefined;

        // Check for edit indicator
        const editedEl = el.querySelector('[class*="edited"]');
        const editedTimestamp = editedEl?.getAttribute('datetime') || undefined;

        // Check for pin indicator
        const isPinned = el.querySelector('[class*="pinned"]') !== null;

        // Check for attachments (images, files, etc.)
        const hasAttachments = el.querySelector('[class*="attachment"]') !== null;

        // Check for embeds (rich content cards)
        const hasEmbeds = el.querySelector('[class*="embed"]') !== null;

        return {
          id,
          author_id: authorId,
          author_name: authorNameFallback,
          author_avatar_url: authorAvatarUrl,
          content,
          timestamp,
          reply_to_message_id: replyToMessageId,
          edited_timestamp: editedTimestamp,
          is_pinned: isPinned,
          has_attachments: hasAttachments,
          has_embeds: hasEmbeds
        };
      });
    });

    return messages as RawMessageData[];
  }
}
