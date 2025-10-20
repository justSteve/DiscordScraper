#!/usr/bin/env node

import DatabaseService from '../services/DatabaseService';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'discord-scraper.db');

console.log('Resetting Discord Scraper database...');
console.log(`Database path: ${DB_PATH}`);

try {
  // Delete existing database if it exists
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('✓ Deleted existing database');
  }

  // Create new database with updated schema
  const db = new DatabaseService(DB_PATH);
  db.initialize();
  db.close();

  console.log('✓ Database reset successfully');
  console.log('  - Tables created: servers, channels, messages, scrape_jobs');
  console.log('  - Schema updated with composite primary key and new fields');
  console.log('  - Indexes created for performance');
} catch (error) {
  console.error('✗ Failed to reset database:', error);
  process.exit(1);
}
