import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';

const router = Router();
const DB_PATH = process.env.DB_PATH || './discord-scraper.db';
const db = new DatabaseService(DB_PATH);

// Note: Database should be initialized before using routes
// Call db.initialize() when setting up the database for the first time

// GET /api/channels - List all channels (optionally filter by server)
router.get('/', (req, res) => {
  try {
    const serverId = req.query.server_id as string | undefined;

    if (serverId) {
      const channels = db.getChannelsByServer(serverId);
      res.json(channels);
    } else {
      // TODO: Implement getAllChannels if needed
      res.status(400).json({ error: 'server_id query parameter required' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /api/channels/:id - Get channel by ID
router.get('/:id', (req, res) => {
  try {
    const channel = db.getChannel(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

export default router;
