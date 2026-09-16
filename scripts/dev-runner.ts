import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { acquireProcessLock, findWorkspaceRoot, isProcessAlive } from '@messenger/shared/node';

const rootDir = findWorkspaceRoot();

// 1. Pre-check all lockfiles to see if any sub-service is already running standalone
const existingLocks = [
  { file: 'system.lock', title: 'Hệ thống Messenger AI Bot Control Center' },
  { file: 'worker.lock', title: 'Worker Scheduler Bot' },
  { file: 'api.lock', title: 'API Server' }
];

for (const item of existingLocks) {
  const p = path.resolve(rootDir, 'data', item.file);
  if (fs.existsSync(p)) {
    try {
      const info = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (info.pid && isProcessAlive(info.pid) && info.pid !== process.pid) {
        const border = '='.repeat(68);
        console.error(`\n${border}`);
        console.error(`❌ [LỖI] ${item.title.toUpperCase()} ĐÃ ĐANG CHẠY Ở NƠI KHÁC TRÊN MÁY!`);
        console.error('-'.repeat(68));
        console.error(`  • Tiến trình đang chạy : PID ${info.pid}`);
        console.error(`  • Thành phần           : ${item.title}`);
        console.error(`  • Thời gian khởi chạy  : ${info.startedAt}`);
        console.error(`  • File khóa (Lockfile) : ${p}`);
        console.error('-'.repeat(68));
        console.error(`👉 Hệ thống đã đang chạy ở một terminal khác.`);
        console.error(`👉 Vui lòng tắt terminal đó hoặc gõ: kill ${info.pid} trước khi khởi động mới.`);
        console.error(`${border}\n`);
        process.exit(1);
      }
    } catch {}
  }
}

// 2. Acquire exclusive single-instance system lock
const { release, lockPath } = acquireProcessLock({
  lockName: 'system.lock',
  serviceTitle: 'Hệ thống Messenger AI Bot Control Center'
});

console.log('============================================================');
console.log('🚀 Đang khởi động hệ thống Messenger AI Bot Control Center...');
console.log(`🔒 Single-instance lock: ${lockPath}`);
console.log('============================================================');

interface ServiceConfig {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  color: string;
}

const reset = '\x1b[0m';
const services: ServiceConfig[] = [
  {
    name: 'API',
    command: 'bun',
    args: ['--filter=@messenger/api', 'run', 'dev'],
    cwd: rootDir,
    color: '\x1b[36m' // Cyan
  },
  {
    name: 'WORKER',
    command: 'bun',
    args: ['--filter=@messenger/worker', 'run', 'dev'],
    cwd: rootDir,
    color: '\x1b[35m' // Magenta
  },
  {
    name: 'ADMIN',
    command: 'bun',
    args: ['--filter=@messenger/admin', 'run', 'dev'],
    cwd: rootDir,
    color: '\x1b[32m' // Green
  }
];

const children: ChildProcess[] = [];
let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🛑 Đang dừng toàn bộ hệ thống...');

  for (const child of children) {
    if (child && !child.killed) {
      try {
        child.kill('SIGINT');
      } catch {}
    }
  }

  // Force kill after 3 seconds if not exited
  setTimeout(() => {
    for (const child of children) {
      if (child && !child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {}
      }
    }
    release();
    process.exit(0);
  }, 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const svc of services) {
  const child = spawn(svc.command, svc.args, {
    cwd: svc.cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  children.push(child);

  child.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`${svc.color}[${svc.name}]${reset} ${line}`);
      }
    }
  });

  child.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.error(`${svc.color}[${svc.name}]${reset} ${line}`);
      }
    }
  });

  child.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.warn(
        `⚠️ [${svc.name}] Dịch vụ đã thoát với code ${code || signal}. Đang dừng các dịch vụ liên quan...`
      );
      shutdown();
    }
  });
}
