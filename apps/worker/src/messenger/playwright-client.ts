import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
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

export interface CallResult {
  success: boolean;
  dryRun: boolean;
  threadId: string;
  callType: 'AUDIO' | 'VIDEO';
  durationSeconds: number;
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
   * Finds or selects the active Facebook / Messenger page in the context.
   * If an extra about:blank page exists alongside a Facebook page, closes the blank page.
   */
  /**
   * Cleans up orphaned Chromium processes and stale locks that could cause
   * Chromium to delegate commands to an old session and pop open unwanted about:blank tabs.
   */
  cleanupOrphanedBrowserProcess(): void {
    try {
      const lockPath = path.join(this.userDataDir, 'SingletonLock');
      if (fs.existsSync(lockPath)) {
        let linkTarget = '';
        try {
          linkTarget = fs.readlinkSync(lockPath);
        } catch {}

        const match = linkTarget.match(/-(\d+)$/);
        if (match && match[1]) {
          const orphanPid = parseInt(match[1], 10);
          if (orphanPid && orphanPid !== process.pid) {
            try {
              process.kill(orphanPid, 0); // Check if process is still alive
              console.warn(`[MessengerClient] Terminating orphaned browser process (PID ${orphanPid}) holding profile lock...`);
              try {
                process.kill(orphanPid, 'SIGTERM');
              } catch {}

              // Wait briefly for process to exit
              const start = Date.now();
              while (Date.now() - start < 1000) {
                try {
                  process.kill(orphanPid, 0);
                  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
                } catch {
                  break; // Process terminated
                }
              }

              // Force kill if still stubbornly alive
              try {
                process.kill(orphanPid, 'SIGKILL');
              } catch {}
            } catch {
              // Process does not exist
            }
          }
        }

        // Clean up stale lock files
        try { fs.unlinkSync(lockPath); } catch {}
        try { fs.unlinkSync(path.join(this.userDataDir, 'SingletonSocket')); } catch {}
        try { fs.unlinkSync(path.join(this.userDataDir, 'SingletonCookie')); } catch {}
      }
    } catch (err: any) {
      console.warn('[MessengerClient] Warning cleaning up orphaned browser lock:', err.message);
    }
  }

  async getActivePage(): Promise<Page | null> {
    if (!this.context) return null;
    const pages = this.context.pages().filter((p) => !p.isClosed());
    if (pages.length === 0) {
      this.page = await this.context.newPage();
      await this.page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' }).catch(() => {});
      return this.page;
    }

    // 1. Prefer an open Facebook or Messenger tab
    const fbPage = pages.find((p) => {
      try {
        const u = p.url();
        return u.includes('facebook.com') || u.includes('messenger.com');
      } catch {
        return false;
      }
    });

    if (fbPage) {
      this.page = fbPage;
      // Close any leftover about:blank tabs so they do not steal focus or clutter the browser
      for (const p of pages) {
        if (p !== fbPage && !p.isClosed()) {
          try {
            if (p.url() === 'about:blank') {
              p.close().catch(() => {});
            }
          } catch {}
        }
      }
      return this.page;
    }

    // 2. If current this.page is still open and not about:blank, keep using it
    if (this.page && !this.page.isClosed()) {
      try {
        if (this.page.url() !== 'about:blank') {
          return this.page;
        }
      } catch {}
    }

    // 3. If there are other open non-blank pages, use the latest
    const nonBlank = pages.filter((p) => {
      try {
        return p.url() !== 'about:blank';
      } catch {
        return false;
      }
    });
    if (nonBlank.length > 0) {
      this.page = nonBlank[nonBlank.length - 1];
      return this.page;
    }

    // 4. If all tabs are about:blank, use the first tab and navigate it immediately
    this.page = pages[0];
    if (this.page.url() === 'about:blank') {
      await this.page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    // Close remaining about:blank duplicates
    for (let i = 1; i < pages.length; i++) {
      if (!pages[i].isClosed() && pages[i].url() === 'about:blank') {
        pages[i].close().catch(() => {});
      }
    }
    return this.page;
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
      // Ensure no orphaned browser process is holding the profile before launching
      this.cleanupOrphanedBrowserProcess();

      const launchBrowser = async () => {
        return chromium.launchPersistentContext(this.userDataDir, {
          headless: this.headless,
          viewport: { width: 1280, height: 800 },
          permissions: ['microphone', 'camera'],
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream'
          ]
        });
      };

      try {
        this.context = await launchBrowser();
      } catch (err: any) {
        if (err.message && err.message.includes('Opening in existing browser session')) {
          console.warn('[MessengerClient] Browser profile was held by another session. Retrying after aggressive cleanup...');
          this.cleanupOrphanedBrowserProcess();
          this.context = await launchBrowser();
        } else {
          throw err;
        }
      }

      this.page = await this.getActivePage();
      if (this.page && this.page.url() === 'about:blank') {
        // Navigate initial page to facebook.com/messages so it never stays on about:blank
        await this.page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' }).catch(() => {});
      }
    }
  }

  /**
   * Reads cookies directly from disk SQLite database without launching Chromium
   */
  checkSessionCookiesFromDisk(): SessionStatus {
    const cookieDbPath = path.join(this.userDataDir, 'Default', 'Cookies');
    if (!fs.existsSync(cookieDbPath)) {
      return 'UNAUTHENTICATED';
    }

    try {
      const db = new Database(cookieDbPath, { readonly: true, fileMustExist: true });
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM cookies 
        WHERE (host_key LIKE '%facebook.com%' OR host_key LIKE '%messenger.com%') 
          AND name = 'c_user'
      `).get() as { count: number } | undefined;
      db.close();

      return (row && row.count > 0) ? 'LOGGED_IN' : 'UNAUTHENTICATED';
    } catch {
      return 'UNKNOWN';
    }
  }

  /**
   * Check login / session status on Messenger Web
   * @param forceNavigate If true, navigate to messages page if not already on Facebook/Messenger. If false, check existing DOM without reloading.
   */
  async checkSession(forceNavigate: boolean = false): Promise<SessionStatus> {
    if (this.isDryRun) {
      // In DRY_RUN mode, simulate logged-in status
      return 'LOGGED_IN';
    }

    // CRITICAL: If the browser is NOT currently open and we are NOT forced to open it:
    // Check session offline from disk cookies and DO NOT launch a visible GUI browser window!
    if (!this.context) {
      const offlineStatus = this.checkSessionCookiesFromDisk();
      if (offlineStatus !== 'UNKNOWN') {
        return offlineStatus;
      }
      if (!forceNavigate) {
        return 'UNAUTHENTICATED';
      }
      // Only launch browser if explicitly forced by user
      await this.init();
    }

    if (!this.context) return 'UNAUTHENTICATED';

    try {
      // 1. Fast in-memory cookie check if context exists
      const cookies = await this.context.cookies(['https://www.facebook.com', 'https://www.messenger.com']).catch(() => []);
      const hasCUser = cookies.some((c) => c.name === 'c_user');
      if (!hasCUser) {
        return 'UNAUTHENTICATED';
      }

      const page = await this.getActivePage();
      if (!page) return 'UNKNOWN';

      const currentUrl = page.url();
      const isOnFbOrMessenger =
        currentUrl.includes('facebook.com') || currentUrl.includes('messenger.com');

      // Only navigate if explicitly requested AND not already on Facebook or Messenger
      if (forceNavigate) {
        if (!isOnFbOrMessenger || currentUrl === 'about:blank') {
          await page.goto('https://www.facebook.com/messages', {
            waitUntil: 'domcontentloaded',
            timeout: 20000
          });
          await page.waitForTimeout(1000);
        }
      }

      // If on about:blank and didn't force navigate, passively report UNAUTHENTICATED
      if (page.url() === 'about:blank') {
        return 'UNAUTHENTICATED';
      }

      const activeUrl = page.url();

      // 1. Check if redirected to login page or checkpoint
      if (
        activeUrl.includes('/login') ||
        activeUrl.includes('/checkpoint') ||
        activeUrl.includes('login_attempt') ||
        activeUrl.includes('/recover')
      ) {
        return 'UNAUTHENTICATED';
      }

      // 2. Check for login input fields or login buttons
      const loginInput = await page.$(
        'input#email, input[name="email"], input[type="password"], button[name="login"], form[action*="login"]'
      );
      if (loginInput) {
        return 'UNAUTHENTICATED';
      }

      // 3. Check for messages UI or navigation
      const chatApp = await page.$(
        'div[role="navigation"], div[role="main"], div[role="textbox"], [aria-label*="Chats"], [aria-label*="Đoạn chat"]'
      );
      if (chatApp) {
        return 'LOGGED_IN';
      }

      // 4. Check page title for login hints
      const pageTitle = await page.title().catch(() => '');
      if (/log in|sign up|đăng nhập/i.test(pageTitle)) {
        return 'UNAUTHENTICATED';
      }

      return hasCUser ? 'LOGGED_IN' : 'UNKNOWN';
    } catch {
      return 'SESSION_EXPIRED';
    }
  }

  /**
   * Open Messenger login page and bring browser window to front
   */
  async openLoginPage(): Promise<void> {
    await this.init();
    const page = await this.getActivePage();
    if (!page) return;
    const currentUrl = page.url();
    if (!currentUrl.includes('messenger.com') && !currentUrl.includes('facebook.com')) {
      await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await page.bringToFront().catch(() => {});
  }

  /**
   * Disconnect / clear session cookies and navigate to login
   */
  async disconnectSession(): Promise<void> {
    try {
      if (this.context) {
        await this.context.clearCookies();
        const page = await this.getActivePage();
        if (page) {
          await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('[MessengerClient] Disconnect error:', err.message);
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
      this.page = await this.getActivePage();
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
   * Start a Messenger voice or video call to target thread
   */
  async startCall(
    targetThreadId: string,
    callType: 'AUDIO' | 'VIDEO' = 'AUDIO',
    durationSeconds: number = 25
  ): Promise<CallResult> {
    const timestamp = new Date().toISOString();

    if (this.isDryRun) {
      console.log(`[Messenger] (DRY_RUN) Simulated ${callType} call to ${targetThreadId}`);
      return {
        success: true,
        dryRun: true,
        threadId: targetThreadId,
        callType,
        durationSeconds,
        timestamp
      };
    }

    try {
      await this.init();
      this.page = await this.getActivePage();
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

      console.log(`[Messenger] Navigating for call to ${threadUrl}...`);
      await this.page.goto(threadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await this.page.waitForTimeout(3000);

      // Dismiss any popups/shortcuts
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
          await closeButtons.first().click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(500);
        }
      } catch {}

      // Locate call button in header
      const audioSelectors = [
        'div[aria-label*="gọi thoại" i]',
        'div[aria-label*="cuộc gọi thoại" i]',
        'div[aria-label*="voice call" i]',
        'div[aria-label*="audio call" i]',
        '[aria-label*="Bắt đầu gọi thoại" i]',
        '[aria-label*="Bắt đầu cuộc gọi thoại" i]',
        '[aria-label="Bắt đầu gọi thoại"]',
        '[aria-label="Start a voice call"]',
        '[aria-label="Start voice call"]'
      ].join(', ');

      const videoSelectors = [
        'div[aria-label*="gọi video" i]',
        'div[aria-label*="cuộc gọi video" i]',
        'div[aria-label*="video call" i]',
        '[aria-label*="Bắt đầu gọi video" i]',
        '[aria-label*="Bắt đầu cuộc gọi video" i]',
        '[aria-label="Bắt đầu gọi video"]',
        '[aria-label="Start a video call"]',
        '[aria-label="Start video call"]'
      ].join(', ');

      const targetSelector = callType === 'VIDEO' ? videoSelectors : audioSelectors;
      const callBtn = this.page.locator(targetSelector).first();

      await callBtn.waitFor({ state: 'visible', timeout: 20000 });
      console.log(`[Messenger] Initiating ${callType} call button click...`);
      await callBtn.click({ force: true });

      // Track if a popup window or in-page call window opens
      let callPage: Page = this.page;
      try {
        const popupPromise = this.context?.waitForEvent('page', { timeout: 4000 });
        if (popupPromise) {
          const popup = await popupPromise.catch(() => null);
          if (popup) {
            callPage = popup;
            console.log('[Messenger] Call opened in popup window');
          }
        }
      } catch {}

      // Ring for the specified duration (clamped between 5s and 180s)
      const effectiveDuration = Math.max(5, Math.min(durationSeconds, 180));
      console.log(`[Messenger] Call is ringing. Waiting for ${effectiveDuration} seconds...`);
      await new Promise((r) => setTimeout(r, effectiveDuration * 1000));

      // End the call
      try {
        const endCallSelectors = [
          'div[aria-label*="Kết thúc cuộc gọi" i]',
          'div[aria-label*="Kết thúc" i]',
          'div[aria-label*="End call" i]',
          'div[aria-label*="Rời khỏi" i]',
          'div[aria-label*="Leave call" i]',
          'div[aria-label*="Gác máy" i]',
          'div[aria-label*="Hang up" i]',
          'button[aria-label*="End" i]',
          'button[aria-label*="Kết thúc" i]'
        ].join(', ');

        const endBtn = callPage.locator(endCallSelectors).first();
        if ((await endBtn.count()) > 0 && (await endBtn.isVisible().catch(() => false))) {
          console.log('[Messenger] Hanging up call...');
          await endBtn.click({ force: true }).catch(() => {});
        } else if (callPage !== this.page) {
          await callPage.close().catch(() => {});
        }
      } catch (err: any) {
        console.warn('[Messenger] Could not cleanly hang up call:', err.message);
      }

      console.log(`[Messenger] Call finished successfully.`);
      return {
        success: true,
        dryRun: false,
        threadId: targetThreadId,
        callType,
        durationSeconds: effectiveDuration,
        timestamp
      };
    } catch (err: any) {
      console.error('[Messenger] Call failed:', err.message);
      return {
        success: false,
        dryRun: false,
        threadId: targetThreadId,
        callType,
        durationSeconds,
        error: err.message || `Failed to initiate ${callType} call via Messenger Web`,
        timestamp
      };
    }
  }

  /**
   * Graceful cleanup
   */
  async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch (err: any) {
        console.warn('[MessengerClient] Context close warning:', err.message);
      }
      this.context = null;
      this.page = null;
    }
    this.cleanupOrphanedBrowserProcess();
  }
}
