# Discord Authentication Guide

Discord's web scraper requires full browser authentication including:
- Session cookies
- Local storage (token)
- Browser fingerprint/session data

## Problem
Discord shows "We can't find this computer" when using just the token because it detects automation and requires additional verification.

## Solution Options

### Option 1: Run Auth Setup from Windows (RECOMMENDED)

Since you're in WSL without GUI, you need to run the auth setup from Windows:

1. Open PowerShell in Windows
2. Navigate to: `\\wsl$\Ubuntu\root\projects\ScrapeDiscord`
3. Run: `node setup-persistent-auth.js`
4. Log into Discord in the browser that opens
5. Navigate to your channel to verify it works
6. Close the browser
7. The authentication will be saved to `.browser-data/`

Then modify `DiscordBrowserController.ts` to use persistent context instead of regular browser launch.

### Option 2: Use System Browser Profile

Point Playwright to your existing Edge/Chrome profile:

**Find your Edge profile path:**
- Windows: `C:\Users\YourUsername\AppData\Local\Microsoft\Edge\User Data`
- Linux: `~/.config/microsoft-edge/`

Then launch with:
```javascript
const context = await chromium.launchPersistentContext(
  'path/to/edge/profile',
  { channel: 'msedge', headless: false }
);
```

**WARNING**: Don't use headless mode with your real profile, and close all other browser instances first.

### Option 3: Discord Bot API (BEST for production)

Instead of web scraping, create a Discord bot:

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Add a bot to your application
4. Copy the bot token
5. Invite the bot to your server
6. Use Discord.js or the REST API to fetch messages

**Pros:**
- Official, supported method
- No authentication issues
- Better performance
- Follows Discord's ToS

**Cons:**
- Requires bot to be added to server
- You need appropriate permissions
- Different API from web scraping

## Current Issue

The token extracted from your browser's DevTools is just one piece of authentication. Discord requires:
- Token in localStorage ✓ (we have this)
- Session cookies (might be missing)
- Browser fingerprint (automated browsers are flagged)
- Device verification (QR code or trusted device)

## Next Steps

**If you want to continue with web scraping:**
- Option 1 is your best bet - run auth from Windows to save full browser state
- Or consider Option 3 (Bot API) which is more reliable

**If you go with Bot API:**
Let me know and I can help you set that up instead.
