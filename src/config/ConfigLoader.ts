import * as fs from 'fs';
import * as yaml from 'yaml';
import { DiscordConfig } from '../domain/models/types';
import { ConfigValidator } from './ConfigValidator';

class ConfigLoader {
  static load(configPath: string): DiscordConfig {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const fileContents = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.parse(fileContents);

    // Validate config structure
    ConfigValidator.validate(config);

    return config as DiscordConfig;
  }
}

export default ConfigLoader;
