/**
 * Raw message data extracted from Discord's DOM.
 * This is the intermediate format before parsing into the Message type.
 */
export interface RawMessageData {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string;
  content?: string;
  timestamp: string;  // ISO 8601 format
  reply_to_message_id?: string;
  edited_timestamp?: string;
  is_pinned?: boolean;
  attachment_urls?: string[];
  embed_data?: any;
  has_attachments: boolean;
  has_embeds: boolean;
}
