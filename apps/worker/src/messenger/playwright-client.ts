import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import type { SessionStatus } from '@messenger/shared';

export interface MessengerClientOptions {
  userDataDir?: string;
  isDryRun?: boolean;
  headless?: boolean;
}

export interface SendResult {
  success: boolean;
  dryRun: boolean;
  threadId: string;
  message: string;
  error?: string;
  timestamp: string;
}

export class MessengerClient {
  private userDataDir: string;
  private isDryRun: boolean;
  private headless: boolean;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(options?: MessengerClientOptions) {
    this.userDataDir = path.resolve(
      process.cwd(),
      options?.userDataDir || process.env.MESSENGER_USER_DATA_DIR || './.messenger-session'
    );
    this.isDryRun = options?.isDryRun ?? (process.env.DRY_RUN !== 'false');
    this.headless = options?.headless ?? true;
  }

  getDryRun(): boolean {
    return this.isDryRun;
  }

  setDryRun(val: boolean): void {
    this.isDryRun = val;
  }

  /**
   * Initializes the persistent browser context if not in DRY_RUN
   */
  async init(): Promise<void> {
    if (this.isDryRun) {
      // In dry-run mode, we do not launch a real browser
      return;
    }

    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }

    if (!this.context) {
      this.context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: this.headless,
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    }
  }

  /**
   * Check login / session status on Messenger Web
   */
  async checkSession(): Promise<SessionStatus> {
    if (this.isDryRun) {
      // In DRY_RUN mode, simulate logged-in status
      return 'LOGGED_IN';
    }

    try {
      await this.init();
      if (!this.page) return 'UNKNOWN';

      await this.page.goto('https://www.facebook.com/messages', {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });

      // Check if redirected to login page
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        return 'UNAUTHENTICATED';
      }

      // Check for login input fields
      const loginInput = await this.page.$('input#email, input[name="email"]');
      if (loginInput) {
        return 'UNAUTHENTICATED';
      }

      // Check for messages UI or navigation
      const chatApp = await this.page.$(
        'div[role="navigation"], div[role="main"], div[role="textbox"], [aria-label*="Chats"]'
      );
      if (chatApp) {
        return 'LOGGED_IN';
      }

      return 'UNKNOWN';
    } catch {
      return 'SESSION_EXPIRED';
    }
  }

  /**
   * Select a thread and dispatch message
   */
  async sendMessage(targetThreadId: string, message: string): Promise<SendResult> {
    const timestamp = new Date().toISOString();

    // 1. If DRY_RUN is active, simulate success immediately without touching network
    if (this.isDryRun) {
      return {
        success: true,
        dryRun: true,
        threadId: targetThreadId,
        message,
        timestamp
      };
    }

    // 2. Real browser automation
    try {
      await this.init();
      if (!this.page) {
        throw new Error('Browser page could not be initialized');
      }

      // Build target URL
      const threadUrl = targetThreadId.startsWith('http')
        ? targetThreadId
        : `https://www.facebook.com/messages/t/${targetThreadId.trim()}`;

      await this.page.goto(threadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 25000
      });

      // Locate the message input box
      const inputSelector = 'div[role="textbox"][contenteditable="true"], div[aria-label="Message"]';
      await this.page.waitForSelector(inputSelector, { timeout: 15000 });

      const input = await this.page.$(inputSelector);
      if (!input) {
        throw new Error(`Message input box not found for thread ${targetThreadId}`);
      }

      await input.click();
      await input.fill('');
      // Type text simulating user keystrokes
      await this.page.keyboard.type(message, { delay: 30 });
      await this.page.keyboard.press('Enter');

      // Wait 1.5 seconds for send confirmation
      await this.page.waitForTimeout(1500);

      return {
        success: true,
        dryRun: false,
        threadId: targetThreadId,
        message,
        timestamp
      };
    } catch (err: any) {
      return {
        success: false,
        dryRun: false,
        threadId: targetThreadId,
        message,
        error: err.message || 'Failed to send message via Messenger Web',
        timestamp
      };
    }
  }

  /**
   * Graceful cleanup
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}
