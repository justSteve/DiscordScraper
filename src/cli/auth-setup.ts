#!/usr/bin/env node

import { DiscordBrowserController } from '../domain/scrape-engine/DiscordBrowserController';
import ConfigLoader from '../config/ConfigLoader';
import * as path from 'path';
import * as readline from 'readline';

const CONFIG_PATH = path.join(process.cwd(), 'discord-config.yaml');

async function waitForUserInput(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log('Discord Authentication Setup');
  console.log('============================\n');

  // Load config to get cookies path
  let config;
  try {
    config = ConfigLoader.load(CONFIG_PATH);
  } catch (error) {
    console.error('Failed to load config:', error);
    process.exit(1);
  }

  const cookiesPath = path.join(process.cwd(), config.auth.cookies_file);

  console.log('This will launch a visible browser window.');
  console.log('Please log into Discord manually.');
  console.log('Once logged in, press Enter to save cookies.\n');

  const controller = new DiscordBrowserController(false); // Visible browser

  try {
    await controller.launch();
    console.log('Browser launched. Navigating to Discord...\n');

    // Navigate to Discord homepage
    const page = controller.getPage();
    await page.goto('https://discord.com/login', { waitUntil: 'networkidle' });

    console.log('Please log in to Discord in the browser window.');
    await waitForUserInput('Press Enter once you are logged in... ');

    // Save cookies
    await controller.saveCookiesToFile(cookiesPath);
    console.log(`\n✓ Cookies saved to ${cookiesPath}`);
    console.log('  You can now run scraping operations.');

    await controller.close();
  } catch (error) {
    console.error('\n✗ Authentication setup failed:', error);
    await controller.close();
    process.exit(1);
  }
}

main();
