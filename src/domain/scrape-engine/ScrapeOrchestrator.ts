import DatabaseService from '../../services/DatabaseService';
import { DiscordConfig } from '../models/types';
import { DiscordBrowserController } from './DiscordBrowserController';
import { MessageScroller } from './MessageScroller';
import { DiscordDOMExtractor } from './dom-selectors';
import { MessageParser } from '../metadata-capture/MessageParser';

/**
 * ScrapeOrchestrator
 *
 * Coordinates the entire Discord scraping workflow:
 * 1. Update job status to running
 * 2. Launch browser and navigate to channel
 * 3. Loop: Extract messages → Parse → Store → Scroll
 * 4. Update job status to completed
 * 5. Handle errors (fail fast)
 */
export class ScrapeOrchestrator {
  constructor(
    private db: DatabaseService,
    private config: DiscordConfig
  ) {}

  /**
   * Execute a scrape job synchronously (blocks until complete).
   *
   * @param jobId - ID of the scrape job to execute
   * @throws Error if job not found, channel not configured, or scraping fails
   */
  async executeScrapeJob(jobId: number): Promise<void> {
    let browser: DiscordBrowserController | null = null;

    try {
      // Get job details
      const job = this.db.getScrapeJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // Find server_id for this channel
      const { serverId, channelConfig } = this.findChannelInConfig(job.channel_id);
      if (!serverId || !channelConfig) {
        throw new Error(`Channel ${job.channel_id} not found in config`);
      }

      // Update job status to running
      this.db.updateScrapeJobStatus(jobId, 'running');

      // Initialize components
      browser = new DiscordBrowserController(this.config.scraping.headless);
      const extractor = new DiscordDOMExtractor();
      const parser = new MessageParser(job.channel_id, serverId);

      // Launch browser and navigate to channel
      await browser.launch();
      await browser.loadCookiesFromFile(this.config.auth.cookies_file);
      await browser.navigateToChannel(serverId, job.channel_id);

      // Create scroller
      const page = browser.getPage();
      const scroller = new MessageScroller(page, this.config.scraping.scroll_delay_ms);

      // Wait for initial messages to load
      await scroller.waitForMessages();

      // Scraping loop: extract, parse, store, scroll
      let atTop = false;
      while (!atTop) {
        // Extract messages from current view
        const rawMessages = await extractor.extractMessages(page);

        // Parse and store each message
        for (const rawMsg of rawMessages) {
          const message = parser.parseMessage(rawMsg);
          this.db.insertMessage(message);
          this.db.incrementMessagesScraped(jobId, 1);
        }

        // Scroll up to load older messages
        atTop = await scroller.scrollUp();
      }

      // Mark job as completed
      this.db.updateScrapeJobStatus(jobId, 'completed');

    } catch (error) {
      // Mark job as failed with error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.db.updateScrapeJobStatus(jobId, 'failed', errorMessage);
      throw error;

    } finally {
      // Always close browser
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Find the server_id for a given channel_id in the config.
   *
   * @param channelId - Channel ID to look up
   * @returns Object with serverId and channelConfig, or undefined if not found
   */
  private findChannelInConfig(channelId: string): { serverId: string; channelConfig: any } | { serverId: undefined; channelConfig: undefined } {
    for (const server of this.config.servers) {
      const channel = server.channels.find(ch => ch.id === channelId);
      if (channel) {
        return { serverId: server.id, channelConfig: channel };
      }
    }
    return { serverId: undefined, channelConfig: undefined };
  }
}
