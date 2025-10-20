#!/usr/bin/env node

import DatabaseService from '../services/DatabaseService';
import * as path from 'path';

const DB_PATH = path.join(process.cwd(), 'discord-scraper.db');

console.log('Initializing Discord Scraper database...');
console.log(`Database path: ${DB_PATH}`);

try {
  const db = new DatabaseService(DB_PATH);
  db.initialize();
  db.close();

  console.log('✓ Database initialized successfully');
  console.log('  - Tables created: servers, channels, messages, scrape_jobs');
  console.log('  - Indexes created for performance');
} catch (error) {
  console.error('✗ Failed to initialize database:', error);
  process.exit(1);
}
