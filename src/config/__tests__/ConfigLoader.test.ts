import ConfigLoader from '../ConfigLoader';
import * as fs from 'fs';
import * as path from 'path';

const TEST_CONFIG_PATH = './test-config.yaml';

describe('ConfigLoader', () => {
  afterEach(() => {
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      fs.unlinkSync(TEST_CONFIG_PATH);
    }
  });

  it('should load valid config file', () => {
    const validConfig = `
auth:
  cookies_file: "./cookies.json"

scraping:
  headless: true
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

servers:
  - id: "server_1"
    name: "Test Server"
    channels:
      - id: "channel_1"
        name: "general"
`;
    fs.writeFileSync(TEST_CONFIG_PATH, validConfig);

    const config = ConfigLoader.load(TEST_CONFIG_PATH);

    expect(config.auth.cookies_file).toBe('./cookies.json');
    expect(config.scraping.headless).toBe(true);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].channels).toHaveLength(1);
  });

  it('should throw error for missing required fields', () => {
    const invalidConfig = `
auth:
  cookies_file: "./cookies.json"
`;
    fs.writeFileSync(TEST_CONFIG_PATH, invalidConfig);

    expect(() => ConfigLoader.load(TEST_CONFIG_PATH)).toThrow();
  });

  it('should throw error for duplicate channel IDs', () => {
    const duplicateConfig = `
auth:
  cookies_file: "./cookies.json"

scraping:
  headless: true
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

servers:
  - id: "server_1"
    name: "Server 1"
    channels:
      - id: "channel_1"
        name: "general"
  - id: "server_2"
    name: "Server 2"
    channels:
      - id: "channel_1"
        name: "random"
`;
    fs.writeFileSync(TEST_CONFIG_PATH, duplicateConfig);

    expect(() => ConfigLoader.load(TEST_CONFIG_PATH)).toThrow('Duplicate channel ID');
  });

  it('should throw error if config file does not exist', () => {
    expect(() => ConfigLoader.load('./nonexistent.yaml')).toThrow();
  });
});
