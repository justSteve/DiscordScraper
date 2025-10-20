import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';

const router = Router();
const DB_PATH = process.env.DB_PATH || './discord-scraper.db';
const db = new DatabaseService(DB_PATH);

// Note: Database should be initialized before using routes
// Call db.initialize() when setting up the database for the first time

// GET /api/messages/:channelId - Get messages for channel with pagination
router.get('/:channelId', (req, res) => {
  try {
    const channelId = req.params.channelId;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const messages = db.getMessagesByChannel(channelId, limit, offset);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;
