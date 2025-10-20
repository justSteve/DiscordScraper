import { Message } from '../models/types';

interface RawMessageData {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string;
  content?: string;
  timestamp: string;
  reply_to_message_id?: string;
  edited_timestamp?: string;
  is_pinned?: boolean;
  attachment_urls?: string[];
  embed_data?: any;
  has_attachments: boolean;
  has_embeds: boolean;
}

export class MessageParser {
  private channelId: string;
  private serverId: string;

  constructor(channelId: string, serverId: string) {
    this.channelId = channelId;
    this.serverId = serverId;
  }

  parseMessage(data: RawMessageData): Message {
    const message: Message = {
      id: data.id,
      channel_id: this.channelId,
      author_id: data.author_id,
      author_name: data.author_name,
      author_avatar_url: data.author_avatar_url,
      content: data.content,
      timestamp: new Date(data.timestamp),
      reply_to_message_id: data.reply_to_message_id,
      edited_timestamp: data.edited_timestamp ? new Date(data.edited_timestamp) : undefined,
      is_pinned: data.is_pinned || false,
      attachment_urls: data.attachment_urls ? JSON.stringify(data.attachment_urls) : undefined,
      embed_data: data.embed_data ? JSON.stringify(data.embed_data) : undefined,
      message_url: `https://discord.com/channels/${this.serverId}/${this.channelId}/${data.id}`,
      has_attachments: data.has_attachments,
      has_embeds: data.has_embeds
    };

    return message;
  }

  parseMessages(dataArray: RawMessageData[]): Message[] {
    return dataArray.map(data => this.parseMessage(data));
  }
}
