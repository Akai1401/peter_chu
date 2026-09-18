import fs from 'node:fs';
import path from 'node:path';

export interface LockInfo {
  pid: number;
  serviceTitle: string;
  startedAt: string;
  cwd: string;
}

/**
 * Checks whether a given PID is currently active on the system.
 */
export function isProcessAlive(pid: number): boolean {
  if (!pid || isNaN(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === 'EPERM'; // Process exists but owned by another user
  }
}

/**
 * Finds the repository / workspace root containing root package.json
 */
export function findWorkspaceRoot(): string {
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

/**
 * Attempts to acquire an exclusive single-instance lock file.
 * If another instance is already running with an active PID, logs a formatted error and exits.
 */
export function acquireProcessLock(options: {
  lockName: string; // e.g. "system.lock", "worker.lock", "api.lock"
  serviceTitle: string; // e.g. "Toàn bộ hệ thống", "Worker Bot", "API Server"
  autoExitOnConflict?: boolean;
}): { release: () => void; lockPath: string } {
  const root = findWorkspaceRoot();
  const lockDir = path.resolve(root, 'data');
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  const lockPath = path.resolve(lockDir, options.lockName);

  // Check if lock file already exists
  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const info: LockInfo = JSON.parse(raw);

      if (info.pid && isProcessAlive(info.pid)) {
        // Another active instance is running!
        const border = '='.repeat(68);
        console.error(`\n${border}`);
        console.error(`❌ [ERROR] ${options.serviceTitle.toUpperCase()} IS ALREADY RUNNING ELSEWHERE ON THIS MACHINE!`);
        console.error('-'.repeat(68));
        console.error(`  • Running Process PID : ${info.pid}`);
        console.error(`  • Started At          : ${info.startedAt}`);
        console.error(`  • Working Directory   : ${info.cwd}`);
        console.error(`  • Lockfile            : ${lockPath}`);
        console.error('-'.repeat(68));
        console.error(`👉 You cannot launch another instance while an existing instance is active.`);
        console.error(`👉 Please terminate the active terminal or run: kill ${info.pid}`);
        console.error(`${border}\n`);

        if (options.autoExitOnConflict !== false) {
          process.exit(1);
        }
        throw new Error(`Instance lock already held by PID ${info.pid}`);
      } else {
        // Stale lock from a crashed process - safe to clean up
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Instance lock already held')) {
        throw err;
      }
      // Invalid JSON or unreadable, remove it
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
  }

  // Write new lock file
  const currentInfo: LockInfo = {
    pid: process.pid,
    serviceTitle: options.serviceTitle,
    startedAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    cwd: process.cwd()
  };

  fs.writeFileSync(lockPath, JSON.stringify(currentInfo, null, 2), 'utf8');

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (fs.existsSync(lockPath)) {
        const raw = fs.readFileSync(lockPath, 'utf8');
        const info = JSON.parse(raw);
        // Only delete if it belongs to our PID
        if (info.pid === process.pid) {
          fs.unlinkSync(lockPath);
        }
      }
    } catch {}
  };

  // Register exit hooks to remove lockfile automatically
  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });

  return { release, lockPath };
}
