import request from 'supertest';
import DatabaseService from '../../services/DatabaseService';
import * as fs from 'fs';

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
    it('should create scrape job', async () => {
      const res = await request(app)
        .post('/api/scrape/start')
        .send({ channel_id: 'channel_1', scrape_type: 'full' });

      expect(res.status).toBe(200);
      expect(res.body.jobId).toBeGreaterThan(0);
      expect(res.body.status).toBe('pending');
    });

    it('should reject invalid scrape_type', async () => {
      const res = await request(app)
        .post('/api/scrape/start')
        .send({ channel_id: 'channel_1', scrape_type: 'invalid' });

      expect(res.status).toBe(400);
    });
  });
});
