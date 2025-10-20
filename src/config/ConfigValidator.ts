import { DiscordConfig } from '../domain/models/types';

export class ConfigValidator {
  static validate(config: any): void {
    // Check required top-level fields
    if (!config.auth || !config.auth.cookies_file) {
      throw new Error('Missing required field: auth.cookies_file');
    }

    if (!config.scraping) {
      throw new Error('Missing required field: scraping');
    }

    const scraping = config.scraping;
    if (typeof scraping.headless !== 'boolean') {
      throw new Error('scraping.headless must be a boolean');
    }
    if (typeof scraping.scroll_delay_ms !== 'number') {
      throw new Error('scraping.scroll_delay_ms must be a number');
    }
    if (typeof scraping.messages_per_batch !== 'number') {
      throw new Error('scraping.messages_per_batch must be a number');
    }
    if (typeof scraping.max_retries !== 'number') {
      throw new Error('scraping.max_retries must be a number');
    }

    if (!config.servers || !Array.isArray(config.servers)) {
      throw new Error('Missing required field: servers (must be an array)');
    }

    // Check for duplicate server IDs
    const serverIds = new Set<string>();
    const channelIds = new Set<string>();

    for (const server of config.servers) {
      if (!server.id || !server.name) {
        throw new Error('Each server must have id and name');
      }

      if (serverIds.has(server.id)) {
        throw new Error(`Duplicate server ID: ${server.id}`);
      }
      serverIds.add(server.id);

      if (!server.channels || !Array.isArray(server.channels)) {
        throw new Error(`Server ${server.id} must have channels array`);
      }

      for (const channel of server.channels) {
        if (!channel.id || !channel.name) {
          throw new Error(`Each channel must have id and name (server: ${server.id})`);
        }

        if (channelIds.has(channel.id)) {
          throw new Error(`Duplicate channel ID: ${channel.id}`);
        }
        channelIds.add(channel.id);
      }
    }
  }
}
