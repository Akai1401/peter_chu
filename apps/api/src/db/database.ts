import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export function getDbPath(): string {
  const envPath = process.env.DATABASE_PATH || './data/messenger_bot.db';
  return path.isAbsolute(envPath)
    ? envPath
    : path.resolve(findWorkspaceRoot(), envPath);
}

export function initDatabase(dbPath?: string): Database.Database {
  const finalPath = dbPath || getDbPath();
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(finalPath);

  // Enable WAL mode for high concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Load and run schema
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }

  return db;
}

// Global shared DB instance for API service
let sharedDb: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!sharedDb) {
    sharedDb = initDatabase();
  }
  return sharedDb;
}
