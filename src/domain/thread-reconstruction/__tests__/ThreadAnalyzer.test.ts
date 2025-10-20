import { ThreadAnalyzer } from '../ThreadAnalyzer';
import { Message } from '../../models/types';
import DatabaseService from '../../../services/DatabaseService';

jest.mock('../../../services/DatabaseService');

describe('ThreadAnalyzer', () => {
  let analyzer: ThreadAnalyzer;
  let mockDb: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    mockDb = {
      getReplies: jest.fn()
    } as any;

    analyzer = new ThreadAnalyzer(mockDb);
  });

  it('should build thread tree from root message', () => {
    const rootMsg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Root message',
      timestamp: new Date(),
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_1',
      has_attachments: false,
      has_embeds: false
    };

    const reply1: Message = {
      id: 'msg_2',
      channel_id: 'ch_1',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'First reply',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_2',
      has_attachments: false,
      has_embeds: false
    };

    const reply2: Message = {
      id: 'msg_3',
      channel_id: 'ch_1',
      author_id: 'user_3',
      author_name: 'User3',
      content: 'Reply to reply',
      timestamp: new Date(),
      reply_to_message_id: 'msg_2',
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_3',
      has_attachments: false,
      has_embeds: false
    };

    mockDb.getReplies
      .mockReturnValueOnce([reply1])  // Replies to msg_1
      .mockReturnValueOnce([reply2])  // Replies to msg_2
      .mockReturnValueOnce([]);       // Replies to msg_3 (none)

    const tree = analyzer.buildThreadTree(rootMsg);

    expect(tree.message.id).toBe('msg_1');
    expect(tree.replies).toHaveLength(1);
    expect(tree.replies[0].message.id).toBe('msg_2');
    expect(tree.replies[0].replies).toHaveLength(1);
    expect(tree.replies[0].replies[0].message.id).toBe('msg_3');
  });

  it('should handle messages with no replies', () => {
    const msg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Standalone message',
      timestamp: new Date(),
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_1',
      has_attachments: false,
      has_embeds: false
    };

    mockDb.getReplies.mockReturnValue([]);

    const tree = analyzer.buildThreadTree(msg);

    expect(tree.message.id).toBe('msg_1');
    expect(tree.replies).toHaveLength(0);
  });

  it('should calculate thread depth', () => {
    const rootMsg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Root',
      timestamp: new Date(),
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_1',
      has_attachments: false,
      has_embeds: false
    };

    const reply1: Message = {
      id: 'msg_2',
      channel_id: 'ch_1',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'Reply1',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_2',
      has_attachments: false,
      has_embeds: false
    };

    const reply2: Message = {
      id: 'msg_3',
      channel_id: 'ch_1',
      author_id: 'user_3',
      author_name: 'User3',
      content: 'Reply2',
      timestamp: new Date(),
      reply_to_message_id: 'msg_2',
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_3',
      has_attachments: false,
      has_embeds: false
    };

    mockDb.getReplies
      .mockReturnValueOnce([reply1])
      .mockReturnValueOnce([reply2])
      .mockReturnValueOnce([]);

    const tree = analyzer.buildThreadTree(rootMsg);
    const depth = analyzer.getThreadDepth(tree);

    expect(depth).toBe(3);
  });

  it('should count total messages in thread', () => {
    const rootMsg: Message = {
      id: 'msg_1',
      channel_id: 'ch_1',
      author_id: 'user_1',
      author_name: 'User1',
      content: 'Root',
      timestamp: new Date(),
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_1',
      has_attachments: false,
      has_embeds: false
    };

    const reply1: Message = {
      id: 'msg_2',
      channel_id: 'ch_1',
      author_id: 'user_2',
      author_name: 'User2',
      content: 'Reply1',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_2',
      has_attachments: false,
      has_embeds: false
    };

    const reply2: Message = {
      id: 'msg_3',
      channel_id: 'ch_1',
      author_id: 'user_3',
      author_name: 'User3',
      content: 'Reply2',
      timestamp: new Date(),
      reply_to_message_id: 'msg_1',
      message_url: 'https://discord.com/channels/server_1/ch_1/msg_3',
      has_attachments: false,
      has_embeds: false
    };

    mockDb.getReplies
      .mockReturnValueOnce([reply1, reply2])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const tree = analyzer.buildThreadTree(rootMsg);
    const count = analyzer.countThreadMessages(tree);

    expect(count).toBe(3);
  });
});
