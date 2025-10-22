import { chromium, Browser, BrowserContext, Page, Cookie } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export class DiscordBrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private headless: boolean;
  private userDataDir: string;

  constructor(headless: boolean = true, userDataDir?: string) {
    this.headless = headless;
    // Use persistent state directory to maintain authentication
    this.userDataDir = userDataDir || path.join(process.cwd(), '.playwright-state');
  }

  async launch(): Promise<void> {
    // Launch with persistent context to maintain all authentication state
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: this.headless,
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: ['--disable-blink-features=AutomationControlled']
    });

    // Get existing page or create new one
    this.page = this.context.pages()[0] || await this.context.newPage();
  }

  async loadCookiesFromFile(cookiesPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    const cookies = this.loadCookies(cookiesPath);

    // Extract token from cookies if present
    const tokenCookie = cookies.find(c => c.name === 'token');

    // Add non-token cookies to browser context
    const nonTokenCookies = cookies.filter(c => c.name !== 'token');
    if (nonTokenCookies.length > 0) {
      await this.page.context().addCookies(nonTokenCookies);
    }

    // If token exists, we need to inject it into localStorage after navigating to Discord
    // Store it for later injection
    if (tokenCookie) {
      (this.page as any)._discordToken = tokenCookie.value;
    }
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

    // With persistent context, all auth is already maintained
    // Just navigate directly to the channel
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
    if (this.context) {
      await this.context.close();
      this.context = null;
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
