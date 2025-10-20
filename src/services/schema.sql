-- Servers (Discord guilds)
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scraped_at TIMESTAMP
);

-- Channels within servers
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_scraped TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  last_message_id TEXT,
  last_message_timestamp TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar_url TEXT,
  content TEXT,
  timestamp TIMESTAMP NOT NULL,
  reply_to_message_id TEXT,
  edited_timestamp TIMESTAMP,
  is_pinned BOOLEAN DEFAULT 0,
  attachment_urls TEXT,
  embed_data TEXT,
  message_url TEXT NOT NULL,
  has_attachments BOOLEAN DEFAULT 0,
  has_embeds BOOLEAN DEFAULT 0,
  PRIMARY KEY (channel_id, id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
  -- FOREIGN KEY (reply_to_message_id) REFERENCES messages(id)
  -- Removed: FK constraint blocks out-of-order message scraping
);

-- Scrape jobs
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL,
  scrape_type TEXT NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  messages_scraped INTEGER DEFAULT 0,
  error_message TEXT,
  resumed_from_job_id INTEGER,
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (resumed_from_job_id) REFERENCES scrape_jobs(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_id ON messages(id);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
