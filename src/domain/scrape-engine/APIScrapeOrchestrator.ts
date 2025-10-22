import DatabaseService from '../../services/DatabaseService';
import { DiscordConfig } from '../models/types';
import { DiscordAPIClient } from './DiscordAPIClient';

/**
 * APIScrapeOrchestrator
 *
 * Coordinates Discord scraping using the official Discord API instead of browser automation.
 * Much more reliable and performant than web scraping.
 */
export class APIScrapeOrchestrator {
  constructor(
    private db: DatabaseService,
    private config: DiscordConfig,
    private botToken: string
  ) {}

  /**
   * Execute a scrape job using Discord API.
   *
   * @param jobId - ID of the scrape job to execute
   * @throws Error if job not found, channel not configured, or scraping fails
   */
  async executeScrapeJob(jobId: number): Promise<void> {
    try {
      // Get job details
      const job = this.db.getScrapeJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // Update job status to running immediately
      this.db.updateScrapeJobStatus(jobId, 'running');

      // Find server_id for this channel
      const { serverId, channelConfig } = this.findChannelInConfig(job.channel_id);
      if (!serverId || !channelConfig) {
        throw new Error(`Channel ${job.channel_id} not found in config`);
      }

      // Initialize API client
      const apiClient = new DiscordAPIClient(this.botToken);

      // Fetch all messages from the channel
      console.log(`Fetching messages from channel ${job.channel_id}...`);

      const apiMessages = await apiClient.fetchAllMessages(
        job.channel_id,
        (count) => {
          // Progress callback
          console.log(`Fetched ${count} messages so far...`);
        }
      );

      console.log(`Total messages fetched: ${apiMessages.length}`);

      // Convert and store messages
      let storedCount = 0;
      for (const apiMessage of apiMessages) {
        const message = apiClient.convertToMessage(apiMessage, job.channel_id, serverId);

        // Insert message (will skip if duplicate due to primary key)
        try {
          this.db.insertMessage(message);
          storedCount++;
          this.db.incrementMessagesScraped(jobId, 1);
        } catch (error) {
          // Ignore duplicate key errors
          if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint')) {
            throw error;
          }
        }
      }

      console.log(`Stored ${storedCount} new messages`);

      // Update channel metadata
      if (apiMessages.length > 0) {
        const latestMessage = apiMessages[0]; // Discord API returns newest first
        this.db.updateChannelAfterScrape(
          job.channel_id,
          apiMessages.length,
          latestMessage.id,
          latestMessage.timestamp
        );
      }

      // Mark job as completed
      this.db.updateScrapeJobStatus(jobId, 'completed');

    } catch (error) {
      // Mark job as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.db.updateScrapeJobStatus(jobId, 'failed', errorMessage);
      throw error;
    }
  }

  /**
   * Find channel configuration in discord-config.yaml.
   */
  private findChannelInConfig(channelId: string): {
    serverId: string | null;
    channelConfig: any;
  } {
    for (const server of this.config.servers) {
      const channel = server.channels.find(ch => ch.id === channelId);
      if (channel) {
        return { serverId: server.id, channelConfig: channel };
      }
    }
    return { serverId: null, channelConfig: null };
  }
}
