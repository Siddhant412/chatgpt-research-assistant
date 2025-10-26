import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "app.db");
export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  title TEXT,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);
`);
