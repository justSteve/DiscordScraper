import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';
import { ThreadAnalyzer } from '../../domain/thread-reconstruction/ThreadAnalyzer';

const router = Router();
const DB_PATH = process.env.DB_PATH || './discord-scraper.db';
const db = new DatabaseService(DB_PATH);

// Note: Database should be initialized before using routes
// Call db.initialize() when setting up the database for the first time

const analyzer = new ThreadAnalyzer(db);

// GET /api/threads/:messageId - Get conversation thread from message
router.get('/:messageId', (req, res) => {
  try {
    const message = db.getMessage(req.params.messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const tree = analyzer.buildThreadTree(message);
    const depth = analyzer.getThreadDepth(tree);
    const messageCount = analyzer.countThreadMessages(tree);

    res.json({
      tree,
      depth,
      messageCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build thread' });
  }
});

export default router;
