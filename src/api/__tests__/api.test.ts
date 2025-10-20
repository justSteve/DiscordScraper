import request from 'supertest';
import DatabaseService from '../../services/DatabaseService';
import * as fs from 'fs';

// Mock ScrapeOrchestrator before any imports
jest.mock('../../domain/scrape-engine/ScrapeOrchestrator');
jest.mock('../../config/ConfigLoader');

const TEST_DB = './test-api.db';

describe('API Integration Tests', () => {
  let db: DatabaseService;
  let app: any;

  beforeAll(() => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }

    // Set DB_PATH before requiring app
    process.env.DB_PATH = TEST_DB;

    // Initialize database
    db = new DatabaseService(TEST_DB);
    db.initialize();

    // Seed test data
    db.insertServer({ id: 'server_1', name: 'Test Server' });
    db.insertChannel({ id: 'channel_1', server_id: 'server_1', name: 'general', message_count: 0 });

    // Set up mocks
    const { ScrapeOrchestrator } = require('../../domain/scrape-engine/ScrapeOrchestrator');
    const ConfigLoader = require('../../config/ConfigLoader').default;

    // Mock ConfigLoader.load to return a minimal config
    ConfigLoader.load = jest.fn().mockReturnValue({
      auth: { cookies_file: './cookies.json' },
      scraping: { headless: true, scroll_delay_ms: 1000, messages_per_batch: 50, max_retries: 3 },
      servers: [
        {
          id: 'server_1',
          name: 'Test Server',
          channels: [{ id: 'channel_1', name: 'general' }]
        }
      ]
    });

    // Mock ScrapeOrchestrator to avoid actual browser automation
    // The mock needs to update job status like the real orchestrator would
    ScrapeOrchestrator.mockImplementation((dbInstance: DatabaseService, config: any) => ({
      executeScrapeJob: jest.fn().mockImplementation(async (jobId: number) => {
        // Simulate what the real orchestrator does:
        // 1. Update status to running
        dbInstance.updateScrapeJobStatus(jobId, 'running');
        // 2. Do the scraping (we skip this in mock)
        // 3. Update status to completed
        dbInstance.updateScrapeJobStatus(jobId, 'completed');
      })
    }));

    // Don't close - keep connection alive so data persists

    // NOW import app after database is set up
    app = require('../index').default;
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/servers', () => {
    it('should list all servers', async () => {
      const res = await request(app).get('/api/servers');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Test Server');
    });
  });

  describe('POST /api/scrape/start', () => {
    it('should create and execute scrape job', async () => {
      const res = await request(app)
        .post('/api/scrape/start')
        .send({ channel_id: 'channel_1', scrape_type: 'full' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.status).toBe('completed');
    }, 30000);

    it('should reject invalid scrape_type', async () => {
      const res = await request(app)
        .post('/api/scrape/start')
        .send({ channel_id: 'channel_1', scrape_type: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/scrape/start - with orchestrator', () => {
    it('should execute scrape synchronously', async () => {
      const res = await request(app)
        .post('/api/scrape/start')
        .send({ channel_id: 'channel_1', scrape_type: 'full' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
    }, 30000); // 30 second timeout for scraping
  });
});
