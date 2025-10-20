import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';

const router = Router();
const DB_PATH = process.env.DB_PATH || './discord-scraper.db';
const db = new DatabaseService(DB_PATH);

// Note: Database should be initialized before using routes
// Call db.initialize() when setting up the database for the first time

// GET /api/servers - List all servers
router.get('/', (req, res) => {
  try {
    const servers = db.getAllServers();
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// GET /api/servers/:id - Get server by ID
router.get('/:id', (req, res) => {
  try {
    const server = db.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch server' });
  }
});

// GET /api/servers/:id/channels - Get channels for server
router.get('/:id/channels', (req, res) => {
  try {
    const channels = db.getChannelsByServer(req.params.id);
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

export default router;
