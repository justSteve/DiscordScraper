import { Message } from '../models/types';

/**
 * DiscordAPIClient
 *
 * Replaces browser-based scraping with official Discord REST API.
 * Uses a Discord bot token for authentication.
 *
 * Advantages over web scraping:
 * - No authentication issues
 * - No CSS selector breakage
 * - Better performance
 * - Follows Discord's ToS
 */
export class DiscordAPIClient {
  private botToken: string;
  private baseURL = 'https://discord.com/api/v10';

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  /**
   * Fetch messages from a channel using Discord's REST API.
   *
   * @param channelId - Discord channel ID
   * @param limit - Max messages per request (1-100, default 100)
   * @param before - Message ID to fetch messages before (for pagination)
   * @returns Array of Discord API message objects
   */
  async fetchMessages(
    channelId: string,
    limit: number = 100,
    before?: string
  ): Promise<any[]> {
    const url = new URL(`${this.baseURL}/channels/${channelId}/messages`);
    url.searchParams.set('limit', limit.toString());
    if (before) {
      url.searchParams.set('before', before);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bot ${this.botToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Fetch ALL messages from a channel by paginating through history.
   *
   * @param channelId - Discord channel ID
   * @param onProgress - Optional callback for progress updates
   * @returns Array of all messages in the channel
   */
  async fetchAllMessages(
    channelId: string,
    onProgress?: (count: number) => void
  ): Promise<any[]> {
    const allMessages: any[] = [];
    let lastMessageId: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.fetchMessages(channelId, 100, lastMessageId);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      allMessages.push(...batch);
      lastMessageId = batch[batch.length - 1].id;

      if (onProgress) {
        onProgress(allMessages.length);
      }

      // Rate limiting: Discord allows 50 requests per second
      // Add small delay to be safe
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allMessages;
  }

  /**
   * Convert Discord API message format to our internal Message type.
   *
   * @param apiMessage - Message from Discord API
   * @param channelId - Channel ID
   * @param serverId - Server ID
   * @returns Message object matching our database schema
   */
  convertToMessage(apiMessage: any, channelId: string, serverId: string): Message {
    // Extract reply information
    const replyToMessageId = apiMessage.referenced_message?.id;

    // Handle attachments
    const attachmentUrls = apiMessage.attachments?.length > 0
      ? JSON.stringify(apiMessage.attachments.map((a: any) => a.url))
      : undefined;

    // Handle embeds
    const embedData = apiMessage.embeds?.length > 0
      ? JSON.stringify(apiMessage.embeds)
      : undefined;

    // Construct message URL
    const messageUrl = `https://discord.com/channels/${serverId}/${channelId}/${apiMessage.id}`;

    return {
      id: apiMessage.id,
      channel_id: channelId,
      author_id: apiMessage.author.id,
      author_name: apiMessage.author.username,
      author_avatar_url: apiMessage.author.avatar
        ? `https://cdn.discordapp.com/avatars/${apiMessage.author.id}/${apiMessage.author.avatar}.png`
        : undefined,
      content: apiMessage.content || undefined,
      timestamp: apiMessage.timestamp,
      reply_to_message_id: replyToMessageId,
      edited_timestamp: apiMessage.edited_timestamp || undefined,
      is_pinned: apiMessage.pinned ? 1 : 0,
      attachment_urls: attachmentUrls,
      embed_data: embedData,
      message_url: messageUrl,
      has_attachments: apiMessage.attachments?.length > 0 ? 1 : 0,
      has_embeds: apiMessage.embeds?.length > 0 ? 1 : 0
    };
  }
}
