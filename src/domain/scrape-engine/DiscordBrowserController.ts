import { chromium, Browser, Page, Cookie } from 'playwright';
import * as fs from 'fs';

export class DiscordBrowserController {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private headless: boolean;

  constructor(headless: boolean = true) {
    this.headless = headless;
  }

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  }

  async loadCookiesFromFile(cookiesPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    const cookies = this.loadCookies(cookiesPath);
    await this.page.context().addCookies(cookies);
  }

  async saveCookiesToFile(cookiesPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    const cookies = await this.page.context().cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  }

  async navigateToChannel(serverId: string, channelId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    const url = `https://discord.com/channels/${serverId}/${channelId}`;
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched');
    }
    return this.page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  private loadCookies(cookiesPath: string): Cookie[] {
    if (!fs.existsSync(cookiesPath)) {
      throw new Error(`Cookies file not found: ${cookiesPath}`);
    }

    const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
    return JSON.parse(cookiesData);
  }
}
