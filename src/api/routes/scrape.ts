import { Router } from 'express';
import DatabaseService from '../../services/DatabaseService';
import { ScrapeOrchestrator } from '../../domain/scrape-engine/ScrapeOrchestrator';
import ConfigLoader from '../../config/ConfigLoader';

const router = Router();
const DB_PATH = process.env.DB_PATH || './discord-scraper.db';
const db = new DatabaseService(DB_PATH);

// Note: Database should be initialized before using routes
// Call db.initialize() when setting up the database for the first time

// POST /api/scrape/start - Start scrape job
router.post('/start', async (req, res) => {
  try {
    const { channel_id, scrape_type } = req.body;

    if (!channel_id || !scrape_type) {
      return res.status(400).json({ error: 'channel_id and scrape_type required' });
    }

    if (scrape_type !== 'full' && scrape_type !== 'incremental') {
      return res.status(400).json({ error: 'scrape_type must be "full" or "incremental"' });
    }

    // Load config to find server info
    const config = ConfigLoader.load('./discord-config.yaml');

    // Find server and channel in config
    let serverId: string | null = null;
    let serverName = '';
    let channelName = '';

    for (const server of config.servers) {
      const channel = server.channels.find(ch => ch.id === channel_id);
      if (channel) {
        serverId = server.id;
        serverName = server.name;
        channelName = channel.name;
        break;
      }
    }

    if (!serverId) {
      return res.status(400).json({ error: `Channel ${channel_id} not found in config` });
    }

    // Ensure server and channel exist in database
    try {
      db.insertServer({ id: serverId, name: serverName });
    } catch (e) {
      // Ignore if already exists
    }

    try {
      db.insertChannel({ id: channel_id, server_id: serverId, name: channelName, message_count: 0 });
    } catch (e) {
      // Ignore if already exists
    }

    // Create job
    const jobId = db.createScrapeJob(channel_id, scrape_type);
    const orchestrator = new ScrapeOrchestrator(db, config);
    await orchestrator.executeScrapeJob(jobId);

    // Return completed job
    const completedJob = db.getScrapeJob(jobId);
    res.json(completedJob);

  } catch (error) {
    // Job already marked as failed by orchestrator
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/scrape/status/:jobId - Get job status
router.get('/status/:jobId', (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = db.getScrapeJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

// GET /api/scrape/jobs - List all jobs (optional status filter)
router.get('/jobs', (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const jobs = db.getAllScrapeJobs(status);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// POST /api/scrape/resume/:jobId - Resume interrupted job
router.post('/resume/:jobId', (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = db.getScrapeJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'interrupted') {
      return res.status(400).json({ error: 'Can only resume interrupted jobs' });
    }

    // Create new job linked to original
    const newJobId = db.createScrapeJob(job.channel_id, job.scrape_type);

    // TODO: Set resumed_from_job_id (need to add this to createScrapeJob or update separately)

    res.json({ jobId: newJobId, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

export default router;
