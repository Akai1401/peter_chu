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
    this.headless = options?.headless ?? (process.env.MESSENGER_HEADLESS === 'true');
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

      // Build target URL (always use facebook.com session where logged in)
      let threadUrl = targetThreadId.trim();
      const urlMatch = threadUrl.match(/(?:messenger\.com|facebook\.com)?\/?(?:messages\/)?(?:e2ee\/)?t\/([^/?#]+)/i);
      if (urlMatch && urlMatch[1]) {
        threadUrl = `https://www.facebook.com/messages/t/${urlMatch[1]}`;
      } else if (!threadUrl.startsWith('http')) {
        threadUrl = `https://www.facebook.com/messages/t/${threadUrl}`;
      }

      console.log(`[Messenger] Opening thread URL: ${threadUrl}`);
      await this.page.goto(threadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Wait a moment for dynamic elements to settle
      await this.page.waitForTimeout(3000);

      // 1. Check if redirected to login page
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        let domain = 'Messenger';
        try { domain = new URL(threadUrl).hostname; } catch {}
        throw new Error(
          `Phiên đăng nhập chưa có trên ${domain}. Vui lòng chạy 'npm run login:messenger' để đăng nhập trên ${domain}!`
        );
      }

      // 2. Check if E2EE PIN is requested
      const pinInputs = this.page.locator('input[type="password"], input[inputmode="numeric"]');
      if ((await pinInputs.count()) > 0 && (await pinInputs.first().isVisible().catch(() => false))) {
        throw new Error(
          'Đoạn chat yêu cầu mã PIN mã hoá đầu cuối (E2EE PIN). Vui lòng chạy "npm run login:messenger" để mở trình duyệt và nhập mã PIN 1 lần!'
        );
      }

      // 3. Dismiss any modal overlay or shortcut popup if present
      try {
        const closeButtons = this.page.locator([
          'button:has-text("Tắt")',
          '[role="button"]:has-text("Tắt")',
          'div[aria-label="Đóng"]',
          'div[aria-label="Close"]',
          'button:has-text("Lúc khác")',
          'button:has-text("Not now")',
          'button:has-text("Đóng")',
          'button:has-text("Close")'
        ].join(', '));
        if ((await closeButtons.count()) > 0) {
          console.log('[Messenger] Dismissing dialog/modal overlay...');
          await closeButtons.first().click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(500);
        }
      } catch {}

      // 4. Locate the message input box at the bottom (Aa text box)
      const inputSelector = [
        'div[role="main"] div[role="textbox"]',
        'div[role="region"] div[role="textbox"]',
        'div[aria-label*="Viết" i]',
        'div[aria-label*="Tin nhắn" i][contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]'
      ].join(', ');

      const inputLocator = this.page.locator(inputSelector).last();
      await inputLocator.waitFor({ state: 'visible', timeout: 25000 });
      await inputLocator.focus();
      await inputLocator.click({ force: true });
      await this.page.waitForTimeout(500);

      // 5. Type message text simulating user keystrokes
      console.log(`[Messenger] Typing message to thread: ${message.slice(0, 30)}...`);
      await this.page.keyboard.type(message, { delay: 35 });
      await this.page.waitForTimeout(600);

      // 6. Send message: Press Enter and also click send button if present
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(1000);

      // If send icon/button is still visible, click it
      try {
        const sendBtn = this.page.locator([
          'div[aria-label="Nhấn Enter để gửi"]',
          'div[aria-label="Gửi"]',
          'div[aria-label="Send"]',
          'div[aria-label*="Enter để gửi" i]'
        ].join(', ')).first();
        if ((await sendBtn.count()) > 0 && (await sendBtn.isVisible().catch(() => false))) {
          await sendBtn.click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(1000);
        }
      } catch {}

      // 7. Verify message delivery
      await this.page.waitForTimeout(1500);
      const remainingText = await inputLocator.innerText().catch(() => '');
      const inputIsCleared = !remainingText || remainingText.trim() === '';

      // Check if message text appears in the chat thread
      const bubbleLocator = this.page.locator(`text="${message}"`).last();
      const bubbleFound = (await bubbleLocator.count()) > 0;

      console.log(`[Messenger] Verification: inputIsCleared=${inputIsCleared}, bubbleFound=${bubbleFound}`);
      if (!inputIsCleared && !bubbleFound) {
        throw new Error(
          'Không thể gửi tin nhắn: Khung nhập tin nhắn vẫn giữ nguyên nội dung sau khi gửi!'
        );
      }

      console.log(`[Messenger] Message dispatched successfully to ${threadUrl}!`);
      return {
        success: true,
        dryRun: false,
        threadId: targetThreadId,
        message,
        timestamp
      };
    } catch (err: any) {
      console.error('[Messenger] Send failed:', err.message);
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
