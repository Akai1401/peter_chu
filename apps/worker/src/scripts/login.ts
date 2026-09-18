import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

function findWorkspaceRoot(): string {
  let curr = process.cwd();
  while (curr !== path.dirname(curr)) {
    const pkgPath = path.join(curr, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.workspaces) return curr;
      } catch {}
    }
    curr = path.dirname(curr);
  }
  return process.cwd();
}

const rootDir = findWorkspaceRoot();
dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config();

const userDataDir = path.resolve(
  rootDir,
  process.env.MESSENGER_USER_DATA_DIR || './.messenger-session'
);
const dbPath = path.resolve(rootDir, process.env.DATABASE_PATH || './data/messenger_bot.db');

async function runLogin() {
  console.log('========================================================');
  console.log('   MESSENGER AI BOT - FACEBOOK MESSENGER LOGIN');
  console.log('========================================================');
  console.log(`📁 Session storage directory: ${userDataDir}`);
  console.log(`🗄️ Database: ${dbPath}\n`);

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  console.log('🚀 Launching Chrome browser (Headless: False)...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('🌐 Opening Messenger (https://www.messenger.com/login)...');
  await page.goto('https://www.messenger.com/login', { waitUntil: 'domcontentloaded' });

  console.log('\n👉 PLEASE LOG IN TO YOUR ACCOUNT IN THE OPENED MESSENGER WINDOW.');
  console.log('💡 Note: If prompted for an End-to-End Encryption (E2EE) PIN, enter it to unlock your chats.');
  console.log('⏳ Waiting for successful login into the chat inbox...');

  // Poll for login success
  let loggedIn = false;
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes timeout
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const currentUrl = page.url();
      if (!currentUrl.includes('/login') && !currentUrl.includes('/checkpoint')) {
        // Check if chat list or message input or main role is present
        const chatElement = await page.$(
          'div[role="navigation"], div[role="main"], div[role="textbox"], [aria-label*="Chats"], [aria-label*="Đoạn chat"]'
        );
        if (chatElement) {
          loggedIn = true;
          break;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (loggedIn) {
    console.log('\n🎉 LOGIN SUCCESSFUL!');
    console.log('✅ Messenger session securely stored in .messenger-session/');

    // Update SQLite database
    try {
      const db = new Database(dbPath);
      db.prepare(`UPDATE bot_state SET session_status = 'LOGGED_IN', updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run();
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, action, actor, details, level)
        VALUES (?, CURRENT_TIMESTAMP, 'SESSION_LOGIN_SUCCESS', 'user', ?, 'INFO')
      `).run(
        `login-${Date.now()}`,
        JSON.stringify({ userDataDir, timestamp: new Date().toISOString() })
      );
      db.close();
      console.log('✅ Updated session_status = "LOGGED_IN" in Database.');
    } catch (e: any) {
      console.warn('Database update failed:', e.message);
    }
  } else {
    console.log('\n⚠️ Login timed out (5 minutes) or was not completed.');
  }

  console.log('Closing browser...');
  await context.close();
  console.log('Done!\n');
  process.exit(loggedIn ? 0 : 1);
}

runLogin().catch((err) => {
  console.error('Error during login script:', err);
  process.exit(1);
});
