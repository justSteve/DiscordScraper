import { Message } from '../models/types';
import DatabaseService from '../../services/DatabaseService';

export interface MessageNode {
  message: Message;
  replies: MessageNode[];
}

export class ThreadAnalyzer {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  buildThreadTree(rootMessage: Message): MessageNode {
    const node: MessageNode = {
      message: rootMessage,
      replies: []
    };

    // Recursively get all replies
    const replies = this.db.getReplies(rootMessage.id);
    node.replies = replies.map(reply => this.buildThreadTree(reply));

    return node;
  }

  getThreadDepth(node: MessageNode): number {
    if (node.replies.length === 0) {
      return 1;
    }

    const childDepths = node.replies.map(reply => this.getThreadDepth(reply));
    return 1 + Math.max(...childDepths);
  }

  countThreadMessages(node: MessageNode): number {
    let count = 1; // Count this message

    for (const reply of node.replies) {
      count += this.countThreadMessages(reply);
    }

    return count;
  }

  flattenThread(node: MessageNode): Message[] {
    const messages: Message[] = [node.message];

    for (const reply of node.replies) {
      messages.push(...this.flattenThread(reply));
    }

    return messages;
  }
}
