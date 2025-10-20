#!/usr/bin/env node

import ConfigLoader from '../config/ConfigLoader';
import * as path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'discord-config.yaml');

console.log('Validating Discord Scraper configuration...');
console.log(`Config path: ${CONFIG_PATH}`);

try {
  const config = ConfigLoader.load(CONFIG_PATH);

  console.log('✓ Configuration is valid');
  console.log(`  - Servers: ${config.servers.length}`);

  let totalChannels = 0;
  for (const server of config.servers) {
    console.log(`    - ${server.name}: ${server.channels.length} channels`);
    totalChannels += server.channels.length;
  }

  console.log(`  - Total channels: ${totalChannels}`);
  console.log(`  - Cookies file: ${config.auth.cookies_file}`);
  console.log(`  - Headless mode: ${config.scraping.headless}`);
} catch (error) {
  console.error('✗ Configuration validation failed:');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
