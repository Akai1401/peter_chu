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

export interface ImageAttachment {
  mimeType: string;
  data: string; // base64 representation
}

export interface IncomingMessage {
  threadId: string;
  senderName?: string;
  messageText: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; text: string }>;
  imageAttachments?: ImageAttachment[];
}

/**
 * Utility to extract a clean Messenger Thread ID from a URL or raw ID string.
 * Example inputs:
 *  - '100040388333156' -> '100040388333156'
 *  - 'https://www.facebook.com/messages/t/100040388333156' -> '100040388333156'
 *  - 'https://www.facebook.com/messages/e2ee/t/100040388333156/' -> '100040388333156'
 */
export function extractThreadId(urlOrId: string): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/(?:messages\/(?:e2ee\/)?t\/|\/t\/)([^/?#]+)/i);
  if (match && match[1] && match[1] !== 't') {
    return match[1];
  }
  const matchFallback = trimmed.match(/\/messages\/([^/?#]+)/i);
  if (matchFallback && matchFallback[1] && matchFallback[1] !== 't') {
    return matchFallback[1];
  }
  return trimmed;
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
      const cleanThreadId = extractThreadId(targetThreadId);
      const threadUrl = cleanThreadId.startsWith('http')
        ? cleanThreadId
        : `https://www.facebook.com/messages/t/${cleanThreadId}`;

      const currentUrlBefore = this.page.url();
      const isAlreadyOnThread =
        Boolean(cleanThreadId) &&
        cleanThreadId !== 't' &&
        !cleanThreadId.startsWith('http') &&
        currentUrlBefore.includes(cleanThreadId);

      if (!isAlreadyOnThread) {
        console.log(`[Messenger] Opening thread URL: ${threadUrl}`);
        await this.page.goto(threadUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        // Wait a moment for dynamic elements to settle
        await this.page.waitForTimeout(3000);
      } else {
        console.log(`[Messenger] Already on target thread: ${currentUrlBefore}`);
      }

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
      const bubbleFound = await this.page.evaluate((msg) => {
        const main = document.querySelector('div[role="main"]') || document.body;
        return (main.textContent || '').includes(msg.slice(0, 30));
      }, message).catch(() => false);

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
      const cleanThreadId = extractThreadId(targetThreadId);
      const threadUrl = cleanThreadId.startsWith('http')
        ? cleanThreadId
        : `https://www.facebook.com/messages/t/${cleanThreadId}`;

      const currentUrlBefore = this.page.url();
      const isAlreadyOnThread =
        Boolean(cleanThreadId) &&
        cleanThreadId !== 't' &&
        !cleanThreadId.startsWith('http') &&
        currentUrlBefore.includes(cleanThreadId);

      if (!isAlreadyOnThread) {
        console.log(`[Messenger] Opening thread URL for call: ${threadUrl}`);
        await this.page.goto(threadUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await this.page.waitForTimeout(3000);
      } else {
        console.log(`[Messenger] Already on target thread for call: ${currentUrlBefore}`);
      }

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

      // End the call cleanly across all popup windows and in-page overlays
      try {
        const endCallSelectors = [
          'div[aria-label*="Kết thúc cuộc gọi" i]',
          'div[aria-label*="Kết thúc" i]',
          'div[aria-label*="End call" i]',
          'div[aria-label*="Leave call" i]',
          'div[aria-label*="Gác máy" i]',
          'div[aria-label*="Hang up" i]',
          '[data-testid="end_call_button"]',
          'div[role="button"][aria-label*="Kết thúc" i]',
          'div[role="button"][aria-label*="End" i]',
          'button[aria-label*="End" i]',
          'button[aria-label*="Kết thúc" i]'
        ].join(', ');

        // 1. Check all open pages in context (including any call popup windows)
        const allPages = this.context ? this.context.pages() : [this.page];
        for (const p of allPages) {
          try {
            if (p.isClosed()) continue;
            const endBtn = p.locator(endCallSelectors).first();
            if ((await endBtn.count()) > 0 && (await endBtn.isVisible().catch(() => false))) {
              console.log(`[Messenger] Hanging up call on page (${p === this.page ? 'main' : 'popup'})...`);
              await endBtn.click({ force: true }).catch(() => {});
              await p.waitForTimeout(500);
            }
            // Close secondary popup windows
            if (p !== this.page) {
              console.log('[Messenger] Closing call popup window...');
              await p.close().catch(() => {});
            }
          } catch (pageErr: any) {
            console.warn('[Messenger] Error while terminating call page:', pageErr.message);
          }
        }

        // 2. If call was embedded in main page, check if call overlay remains and dismiss or reload
        const remainingEndBtn = this.page.locator(endCallSelectors).first();
        if ((await remainingEndBtn.count()) > 0 && (await remainingEndBtn.isVisible().catch(() => false))) {
          await remainingEndBtn.click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(1000);
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
   * Reads the latest unread incoming message from Messenger.
   * If a targetThread is specified, navigates directly to that conversation and reads its messages.
   * Otherwise checks both the currently open active thread and unread threads in the conversation list.
   */
  async getLatestUnreadIncomingMessage(targetThread?: string): Promise<IncomingMessage | null> {
    if (this.isDryRun) {
      return null;
    }

    try {
      await this.init();
      this.page = await this.getActivePage();
      if (!this.page) return null;

      // Check login state
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        console.warn('[MessengerClient] Session is not logged in (redirected to login/checkpoint).');
        return null;
      }

      // If a specific conversation thread is configured, navigate and check that thread directly
      if (targetThread && targetThread.trim()) {
        const cleanThreadId = extractThreadId(targetThread.trim());
        if (cleanThreadId) {
          const threadUrl = cleanThreadId.startsWith('http')
            ? cleanThreadId
            : `https://www.facebook.com/messages/t/${cleanThreadId}`;

          const isAlreadyOnTarget =
            cleanThreadId !== 't' &&
            !cleanThreadId.startsWith('http') &&
            this.page.url().includes(cleanThreadId);

          if (!isAlreadyOnTarget) {
            console.log(`[MessengerClient] Navigating to configured AI target thread: ${threadUrl}`);
            await this.page.goto(threadUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 25000
            });
            await this.page.waitForTimeout(3000);
          } else {
            console.log(`[MessengerClient] Already on configured AI target thread: ${this.page.url()}`);
          }

          return await this.extractIncomingMessageFromActiveThread();
        }
      }

      // Default behavior when no specific thread is configured:
      if (!currentUrl.includes('facebook.com/messages') && !currentUrl.includes('messenger.com')) {
        console.log('[MessengerClient] Navigating to https://www.facebook.com/messages ...');
        await this.page.goto('https://www.facebook.com/messages', {
          waitUntil: 'domcontentloaded',
          timeout: 25000
        });
        await this.page.waitForTimeout(3000);
      }

      console.log(`[MessengerClient] Scanning for incoming messages at: ${currentUrl}`);

      // 1. Check if a conversation is ALREADY open in the active main pane
      const hasActiveThread = currentUrl.includes('/messages/t/') || currentUrl.includes('/t/');
      if (hasActiveThread) {
        const activeIncoming = await this.extractIncomingMessageFromActiveThread();
        if (activeIncoming) {
          return activeIncoming;
        }
      }

      // 2. Scan sidebar for unread conversation indicators
      const unreadSelector = [
        'div[role="navigation"] [aria-label*="chưa đọc" i]',
        'div[role="navigation"] [aria-label*="unread" i]',
        'div[role="navigation"] [aria-label*="Đánh dấu là đã đọc" i]',
        'div[role="navigation"] [aria-label*="Mark as read" i]',
        'div[role="navigation"] span[style*="background-color: var(--accent)"]',
        'div[role="navigation"] span[style*="background-color: rgb(0, 100, 224)"]',
        'div[role="navigation"] span[style*="background-color: rgb(0, 132, 255)"]',
        'div[role="navigation"] span.x1rg5ohu',
        'div[role="grid"] [aria-label*="chưa đọc" i]',
        'div[role="grid"] [aria-label*="unread" i]',
        'div[data-scope="messages_table"] [aria-label*="chưa đọc" i]',
        'div[data-scope="messages_table"] [aria-label*="unread" i]'
      ].join(', ');

      const unreadLocator = this.page.locator(unreadSelector);
      const unreadCount = await unreadLocator.count();
      console.log(`[MessengerClient] Unread indicators count in sidebar: ${unreadCount}`);

      if (unreadCount > 0) {
        const unreadItem = unreadLocator.first();
        if (await unreadItem.isVisible().catch(() => false)) {
          console.log('[MessengerClient] Detected unread badge in conversation list. Opening thread...');
          await unreadItem.click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(2500);
          return await this.extractIncomingMessageFromActiveThread();
        }
      }

      // 3. Fallback check: inspect the top conversation in sidebar
      const topConversation = this.page.locator([
        'div[role="navigation"] [role="grid"] [role="row"]',
        'div[role="navigation"] a[href*="/messages/t/"]',
        'div[role="navigation"] a[href*="/t/"]',
        'div[role="grid"] [role="row"]'
      ].join(', ')).first();

      if ((await topConversation.count()) > 0 && (await topConversation.isVisible().catch(() => false))) {
        const topText = (await topConversation.innerText().catch(() => '')).trim();
        console.log(`[MessengerClient] Top conversation snippet: ${JSON.stringify(topText.slice(0, 80))}`);
        const lines = topText.split('\n').map((s) => s.trim()).filter(Boolean);
        const isSentByUs = lines.some((l) => /^bạn\s*:/i.test(l) || /^you\s*:/i.test(l));

        if (!isSentByUs && lines.length >= 2) {
          console.log('[MessengerClient] Top active conversation might be an incoming message. Opening...');
          await topConversation.click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(2500);
          return await this.extractIncomingMessageFromActiveThread();
        }
      }

      return null;
    } catch (err: any) {
      console.warn('[MessengerClient] Check incoming message warning:', err.message);
      return null;
    }
  }

  /**
   * Extracts the latest incoming message and chronological multi-turn conversation context
   * from the currently open conversation in div[role="main"].
   */
  private async extractIncomingMessageFromActiveThread(): Promise<IncomingMessage | null> {
    try {
      if (!this.page) return null;

      const activeUrl = this.page.url();
      const threadId = extractThreadId(activeUrl) || activeUrl;

      // Extract sender name from conversation header
      let senderName = '';
      try {
        const headerNameLocator = this.page.locator([
          'div[role="main"] h1',
          'div[role="main"] h2',
          'div[role="main"] [data-scope="messages_header"]'
        ].join(', ')).first();
        if ((await headerNameLocator.count()) > 0) {
          senderName = (await headerNameLocator.innerText().catch(() => '')).trim();
        }
      } catch {}

      // Evaluate conversation bubbles and multi-turn context
      const messageInfo = await this.page.evaluate(() => {
        const main = document.querySelector('div[role="main"]') || document.querySelector('div[role="region"]');
        if (!main) return { error: 'NO_MAIN_ELEMENT' };

        const textElements = Array.from(main.querySelectorAll('div[dir="auto"]'));
        if (textElements.length === 0) return { error: 'NO_TEXT_ELEMENTS' };

        // Inspect up to 25 recent elements to gather conversation flow
        const startIndex = Math.max(0, textElements.length - 25);
        const collected: Array<{ text: string; isOutgoing: boolean; role: 'user' | 'model' }> = [];

        for (let i = startIndex; i < textElements.length; i++) {
          const el = textElements[i] as HTMLElement;
          const text = (el.textContent || '').trim();
          if (!text || text.length === 0) continue;
          if (/^(?:vừa xong|\d+\s*(?:phút|giờ|ngày|giây|tháng)|seen|đã nhận|đã gửi|sent|delivered|active now|đang hoạt động|(?:đã nhỡ|nhỡ)?\s*cuộc gọi(?: thoại| video)?(?:\s+\d{1,2}:\d{2})?|missed (?:audio |video |voice )?call)/i.test(text)) continue;

          let curr: HTMLElement | null = el;
          let isOutgoing = false;

          // 1. Check aria-label and testid attributes
          while (curr && curr !== main) {
            const ariaLabel = curr.getAttribute('aria-label') || '';
            if (/^(?:bạn đã gửi|bạn gửi|you sent)/i.test(ariaLabel)) {
              isOutgoing = true;
              break;
            }
            if (curr.getAttribute('data-testid') === 'outgoing_message') {
              isOutgoing = true;
              break;
            }

            // Styling: background color of accent (blue/purple) means outgoing
            const style = window.getComputedStyle(curr);
            const bg = style.backgroundColor;
            if (bg.includes('0, 132, 255') || bg.includes('0, 100, 224') || bg.includes('24, 119, 242')) {
              isOutgoing = true;
              break;
            }

            if (style.justifyContent === 'flex-end' || style.alignItems === 'flex-end') {
              isOutgoing = true;
              break;
            }

            curr = curr.parentElement;
          }

          // 2. Geometric alignment check: Outgoing bubbles in Messenger are positioned on the right
          if (!isOutgoing) {
            const mainRect = main.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            if (mainRect.width > 0 && elRect.width > 0) {
              const distFromLeft = elRect.left - mainRect.left;
              const distFromRight = mainRect.right - elRect.right;
              const elCenter = elRect.left + elRect.width / 2;
              const mainThreshold = mainRect.left + mainRect.width * 0.5;

              // Outgoing messages are closer to the right margin or centered on the right half
              if (distFromRight < distFromLeft || elCenter > mainThreshold) {
                isOutgoing = true;
              }
            }
          }

          // Deduplicate identical or nested parent/child items
          const prev = collected[collected.length - 1];
          if (prev && prev.text === text && prev.isOutgoing === isOutgoing) {
            continue;
          }
          if (prev && prev.isOutgoing === isOutgoing && prev.text.includes(text)) {
            continue;
          }

          collected.push({
            text,
            isOutgoing,
            role: isOutgoing ? 'model' : 'user'
          });
        }

        if (collected.length === 0) {
          return { error: 'NO_VALID_MESSAGES' };
        }

        // Check the very last message in the thread
        const lastMessage = collected[collected.length - 1];
        if (lastMessage.isOutgoing) {
          // Last message was sent by the Bot/Us. No new incoming customer message.
          return {
            isOutgoingLast: true,
            lastText: lastMessage.text
          };
        }

        // Find all trailing customer messages
        let lastBotIndex = -1;
        for (let i = collected.length - 1; i >= 0; i--) {
          if (collected[i].isOutgoing) {
            lastBotIndex = i;
            break;
          }
        }

        const trailingCustomer = collected.slice(lastBotIndex + 1);
        const historyBefore = collected.slice(0, lastBotIndex + 1);

        const incomingText = trailingCustomer.map((m) => m.text).join('\n');
        const history = historyBefore.map((m) => ({ role: m.role, text: m.text }));

        // Scan for images sent by customer in the active thread
        const allImgs = Array.from(main.querySelectorAll('img')) as HTMLImageElement[];
        const customerImages: Array<{ index: number; base64?: string }> = [];

        for (let idx = 0; idx < allImgs.length; idx++) {
          const img = allImgs[idx];
          const rect = img.getBoundingClientRect();
          // Filter out small avatars, icons, reaction emojis
          if (rect.width < 60 || rect.height < 60) continue;
          if (img.closest('div[role="form"]') || img.closest('div[role="navigation"]')) continue;

          let curr: HTMLElement | null = img;
          let isOutgoing = false;
          while (curr && curr !== main) {
            const ariaLabel = curr.getAttribute('aria-label') || '';
            if (/^(?:bạn đã gửi|bạn gửi|you sent)/i.test(ariaLabel)) {
              isOutgoing = true;
              break;
            }
            if (curr.getAttribute('data-testid') === 'outgoing_message') {
              isOutgoing = true;
              break;
            }
            curr = curr.parentElement;
          }

          if (!isOutgoing) {
            const mainRect = main.getBoundingClientRect();
            const elCenter = rect.left + rect.width / 2;
            const mainThreshold = mainRect.left + mainRect.width * 0.5;
            if (elCenter > mainThreshold) {
              isOutgoing = true;
            }
          }

          if (!isOutgoing) {
            // Attempt canvas downscale (max 800px) & JPEG 80% compression inside browser
            let base64Data: string | undefined;
            try {
              const canvas = document.createElement('canvas');
              let w = img.naturalWidth || rect.width || 400;
              let h = img.naturalHeight || rect.height || 400;
              const maxDim = 800;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, w, h);
                base64Data = canvas.toDataURL('image/jpeg', 0.8);
              }
            } catch {}

            customerImages.push({
              index: idx,
              base64: base64Data
            });
          }
        }

        return {
          isOutgoingLast: false,
          incomingText,
          history,
          customerImages: customerImages.slice(-2) // Take up to 2 latest customer images
        };
      });

      console.log(`[MessengerClient] Evaluated active thread (${threadId}, ${senderName}):`, JSON.stringify({
        isOutgoingLast: messageInfo?.isOutgoingLast,
        incomingTextPreview: messageInfo?.incomingText?.slice(0, 50),
        imagesFound: messageInfo?.customerImages?.length || 0
      }));

      if (messageInfo && !messageInfo.error && !messageInfo.isOutgoingLast) {
        const textContent = (messageInfo.incomingText || '').trim();
        const rawImages = messageInfo.customerImages || [];
        const imageAttachments: ImageAttachment[] = [];

        // Collect optimized images (using canvas dataURL or falling back to Playwright screenshot)
        if (rawImages.length > 0) {
          const imgLocators = this.page.locator('div[role="main"] img');
          for (const rawImg of rawImages) {
            if (rawImg.base64 && rawImg.base64.startsWith('data:image/')) {
              imageAttachments.push({
                mimeType: 'image/jpeg',
                data: rawImg.base64.replace(/^data:[^;]+;base64,/, '')
              });
            } else {
              // Fallback: screenshot element directly via Playwright compositor (immune to CORS)
              try {
                const targetLocator = imgLocators.nth(rawImg.index);
                if ((await targetLocator.count()) > 0) {
                  const screenshotBuf = await targetLocator.screenshot({
                    type: 'jpeg',
                    quality: 80,
                    timeout: 4000
                  });
                  if (screenshotBuf && screenshotBuf.length > 0) {
                    imageAttachments.push({
                      mimeType: 'image/jpeg',
                      data: screenshotBuf.toString('base64')
                    });
                    console.log(`[MessengerClient] Captured customer image via screenshot fallback (${Math.round(screenshotBuf.length / 1024)} KB).`);
                  }
                }
              } catch (ssErr: any) {
                console.warn('[MessengerClient] Failed to screenshot customer image element:', ssErr.message);
              }
            }
          }
        }

        const effectiveText = textContent || (imageAttachments.length > 0 ? '[Khách đã gửi một hình ảnh]' : '');

        if (effectiveText) {
          console.log(`[MessengerClient] Found incoming customer message in thread ${threadId}: "${effectiveText.slice(0, 50)}" with ${messageInfo.history?.length || 0} context messages, ${imageAttachments.length} images.`);
          return {
            threadId,
            senderName: senderName || undefined,
            messageText: effectiveText,
            conversationHistory: messageInfo.history,
            imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
          };
        }
      }

      return null;
    } catch (err: any) {
      console.warn('[MessengerClient] Extract message from active thread warning:', err.message);
      return null;
    }
  }

  /**
   * Navigates to a Messenger thread, scrolls up multiple times to load chat history,
   * and extracts outgoing messages sent by the account owner to analyze persona and style.
   */
  async extractOutgoingMessagesForLearning(
    targetThread: string,
    scrollCount: number = 4
  ): Promise<{ outgoingMessages: string[]; contextSnippet: string }> {
    if (this.isDryRun) {
      return { outgoingMessages: [], contextSnippet: '' };
    }

    await this.init();
    this.page = await this.getActivePage();
    if (!this.page) {
      throw new Error('Không thể khởi tạo hoặc truy cập Messenger Web Page');
    }

    const cleanThreadId = extractThreadId(targetThread.trim());
    const threadUrl = cleanThreadId.startsWith('http')
      ? cleanThreadId
      : `https://www.facebook.com/messages/t/${cleanThreadId}`;

    const isAlreadyOnTarget =
      cleanThreadId !== 't' &&
      !cleanThreadId.startsWith('http') &&
      this.page.url().includes(cleanThreadId);

    if (!isAlreadyOnTarget) {
      console.log(`[MessengerClient] Navigating to thread for persona learning: ${threadUrl}`);
      await this.page.goto(threadUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 25000
      });
      await this.page.waitForTimeout(3000);
    }

    // Scroll up in the message list to load older messages
    console.log(`[MessengerClient] Scrolling up ${scrollCount} times to load chat history...`);
    for (let s = 0; s < scrollCount; s++) {
      try {
        await this.page.evaluate(() => {
          const scrollBox =
            document.querySelector('div[role="main"] div[role="grid"]') ||
            document.querySelector('div[role="main"] div[tabindex="0"]') ||
            document.querySelector('div[role="main"]');
          if (scrollBox) {
            scrollBox.scrollTop = 0;
          }
        });
        await this.page.waitForTimeout(1000);
      } catch (scrollErr: any) {
        console.warn(`[MessengerClient] Scroll warning at iteration ${s}:`, scrollErr.message);
      }
    }

    // Extract text elements and categorize outgoing messages
    const extractedData = await this.page.evaluate(() => {
      const main = document.querySelector('div[role="main"]') || document.querySelector('div[role="region"]');
      if (!main) return { outgoing: [], snippet: '' };

      const textElements = Array.from(main.querySelectorAll('div[dir="auto"]'));
      const outgoingMessages: string[] = [];
      const dialogueFlow: string[] = [];

      for (let i = 0; i < textElements.length; i++) {
        const el = textElements[i] as HTMLElement;
        const text = (el.textContent || '').trim();
        if (!text || text.length < 2) continue;
        if (text.startsWith('http')) continue;
        if (/^(?:vừa xong|\d+\s*(?:phút|giờ|ngày|giây|tháng)|seen|đã nhận|đã gửi|sent|delivered|active now|đang hoạt động|(?:đã nhỡ|nhỡ)?\s*cuộc gọi)/i.test(text)) continue;

        const lowerText = text.toLowerCase();
        // Ignore Facebook Messenger system notices and unsent/deleted message notifications
        if (
          lowerText.includes('đã xóa') ||
          lowerText.includes('đã xoá') ||
          lowerText.includes('đã thu hồi') ||
          lowerText.includes('thu hồi tin nhắn') ||
          lowerText.includes('tin nhắn đã bị') ||
          lowerText.includes('tin nhắn đã được') ||
          lowerText.includes('đã gỡ') ||
          lowerText.includes('unsent') ||
          lowerText.includes('removed a message') ||
          lowerText.includes('deleted a message') ||
          lowerText.includes('đã đặt biệt danh') ||
          lowerText.includes('đã đổi biệt danh') ||
          lowerText.includes('đã đổi chủ đề') ||
          lowerText.includes('đã đổi biểu tượng cảm xúc') ||
          lowerText.includes('đã ghim tin nhắn') ||
          lowerText.includes('đã bỏ ghim') ||
          lowerText.includes('cuộc gọi thoại') ||
          lowerText.includes('cuộc gọi video') ||
          lowerText.includes('cuộc gọi đã kết thúc') ||
          lowerText.includes('thời lượng cuộc gọi') ||
          lowerText.includes('đã bỏ lỡ cuộc gọi') ||
          lowerText.includes('đã bắt đầu cuộc gọi') ||
          /^(?:bạn đã (?:xóa|xoá|thu hồi|gỡ)|tin nhắn đã (?:bị|được) (?:xóa|xoá|thu hồi|gỡ)|(?:bạn|đối phương) đã (?:đặt|đổi|ghim|bỏ ghim)|cuộc gọi)/i.test(lowerText)
        ) {
          continue;
        }

        let curr: HTMLElement | null = el;
        let isOutgoing = false;
        while (curr && curr !== main) {
          const ariaLabel = curr.getAttribute('aria-label') || '';
          if (/^(?:bạn đã gửi|bạn gửi|you sent)/i.test(ariaLabel) || curr.getAttribute('data-testid') === 'outgoing_message') {
            isOutgoing = true;
            break;
          }
          const style = window.getComputedStyle(curr);
          const bg = style.backgroundColor;
          if (bg.includes('0, 132, 255') || bg.includes('0, 100, 224') || bg.includes('24, 119, 242')) {
            isOutgoing = true;
            break;
          }
          if (style.justifyContent === 'flex-end' || style.alignItems === 'flex-end') {
            isOutgoing = true;
            break;
          }
          curr = curr.parentElement;
        }

        if (!isOutgoing) {
          const mainRect = main.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          if (mainRect.width > 0 && elRect.width > 0) {
            const distFromLeft = elRect.left - mainRect.left;
            const distFromRight = mainRect.right - elRect.right;
            const elCenter = elRect.left + elRect.width / 2;
            const mainThreshold = mainRect.left + mainRect.width * 0.5;
            if (distFromRight < distFromLeft || elCenter > mainThreshold) {
              isOutgoing = true;
            }
          }
        }

        // Deduplicate consecutive identical messages
        if (isOutgoing) {
          const lastAdded = outgoingMessages[outgoingMessages.length - 1];
          if (!lastAdded || lastAdded !== text) {
            outgoingMessages.push(text);
          }
          dialogueFlow.push(`Tôi (Chủ nick): "${text}"`);
        } else {
          dialogueFlow.push(`Đối phương: "${text}"`);
        }
      }

      return {
        outgoing: outgoingMessages,
        snippet: dialogueFlow.slice(-30).join('\n')
      };
    });

    console.log(`[MessengerClient] Extracted ${extractedData.outgoing.length} outgoing messages from thread for persona learning.`);
    return {
      outgoingMessages: extractedData.outgoing,
      contextSnippet: extractedData.snippet
    };
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
