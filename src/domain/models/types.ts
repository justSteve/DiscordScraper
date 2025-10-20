export interface Server {
  id: string;
  name: string;
  scraped_at?: Date;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  last_scraped?: Date;
  message_count: number;
  last_message_id?: string;
  last_message_timestamp?: Date;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string;
  content?: string;
  timestamp: Date;
  reply_to_message_id?: string;
  edited_timestamp?: Date;
  is_pinned?: boolean;
  attachment_urls?: string; // JSON array
  embed_data?: string;      // JSON object
  message_url: string;
  has_attachments: boolean;
  has_embeds: boolean;
}

export interface ScrapeJob {
  id?: number;
  channel_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  scrape_type: 'full' | 'incremental';
  started_at?: Date;
  completed_at?: Date;
  messages_scraped: number;
  error_message?: string;
  resumed_from_job_id?: number;
}

export interface DiscordConfig {
  auth: {
    cookies_file: string;
  };
  scraping: {
    headless: boolean;
    scroll_delay_ms: number;
    messages_per_batch: number;
    max_retries: number;
  };
  servers: ConfigServer[];
}

export interface ConfigServer {
  id: string;
  name: string;
  channels: ConfigChannel[];
}

export interface ConfigChannel {
  id: string;
  name: string;
}
