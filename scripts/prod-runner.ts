import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { acquireProcessLock, findWorkspaceRoot, isProcessAlive } from '@messenger/shared/node';

const rootDir = findWorkspaceRoot();

// 1. Verify that production dist files exist
const requiredDistFiles = [
  { path: path.resolve(rootDir, 'apps/api/dist/server.js'), label: 'API (@messenger/api)' },
  { path: path.resolve(rootDir, 'apps/worker/dist/worker.js'), label: 'Worker (@messenger/worker)' },
  { path: path.resolve(rootDir, 'apps/admin/dist/index.html'), label: 'Admin UI (@messenger/admin)' }
];

const missingFiles = requiredDistFiles.filter((item) => !fs.existsSync(item.path));
if (missingFiles.length > 0) {
  console.error('\n' + '='.repeat(68));
  console.error('❌ [ERROR] PROJECT HAS NOT BEEN BUILT BEFORE PRODUCTION START!');
  console.error('-'.repeat(68));
  for (const item of missingFiles) {
    console.error(`  • Missing build artifact: ${item.label}`);
  }
  console.error('-'.repeat(68));
  console.error('👉 Please run the following command before starting:');
  console.error('   bun run build');
  console.error('='.repeat(68) + '\n');
  process.exit(1);
}

// 2. Pre-check all lockfiles to see if any sub-service is already running
const existingLocks = [
  { file: 'system.lock', title: 'Messenger AI Bot Control Center' },
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
        console.error(`❌ [ERROR] ${item.title.toUpperCase()} IS ALREADY RUNNING ELSEWHERE!`);
        console.error('-'.repeat(68));
        console.error(`  • Running Process     : PID ${info.pid}`);
        console.error(`  • Component           : ${item.title}`);
        console.error(`  • Started At          : ${info.startedAt}`);
        console.error(`  • Lockfile            : ${p}`);
        console.error('-'.repeat(68));
        console.error(`👉 Please terminate that process or run: kill ${info.pid} before restarting.`);
        console.error(`${border}\n`);
        process.exit(1);
      }
    } catch {}
  }
}

// 3. Acquire exclusive single-instance system lock
const { release, lockPath } = acquireProcessLock({
  lockName: 'system.lock',
  serviceTitle: 'Production Messenger AI Bot'
});

console.log('============================================================');
console.log('🚀 Starting PRODUCTION: Messenger AI Bot Control Center');
console.log('📦 Mode: PRODUCTION (Compiled JS + Optimized Assets)');
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
    command: 'node',
    args: ['apps/api/dist/server.js'],
    cwd: rootDir,
    color: '\x1b[36m' // Cyan
  },
  {
    name: 'WORKER',
    command: 'node',
    args: ['apps/worker/dist/worker.js'],
    cwd: rootDir,
    color: '\x1b[35m' // Magenta
  },
  {
    name: 'ADMIN',
    command: 'bun',
    args: ['--filter=@messenger/admin', 'run', 'preview', '--', '--port', '3001', '--host'],
    cwd: rootDir,
    color: '\x1b[32m' // Green
  }
];

const children: ChildProcess[] = [];
let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🛑 Stopping entire production system...');

  for (const child of children) {
    if (child && !child.killed) {
      try {
        child.kill('SIGINT');
      } catch {}
    }
  }

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
    env: { ...process.env, NODE_ENV: 'production', FORCE_COLOR: '1' }
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
        `⚠️ [${svc.name}] Production service exited with code ${code || signal}. Stopping related services...`
      );
      shutdown();
    }
  });
}
