import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Anonymous sessions. A session is a JSON document keyed by a random UUID that
 * the browser generates; whoever holds the id (the "continue on another
 * device" link) can read and write it. There are no accounts.
 *
 * Storage is Node's built-in SQLite where the runtime has it (Node 22.13+),
 * and one JSON file per session otherwise, so the app runs either way. Both live in
 * `.data/`. For a multi-instance deployment, replace `open()` with Postgres:
 * the interface is two functions.
 */

export type SessionStore = {
  kind: "sqlite" | "files";
  get(id: string): { data: string; updatedAt: number } | null;
  put(id: string, data: string, updatedAt: number): void;
};

const DIR = path.join(process.cwd(), ".data");

function openSqlite(): SessionStore {
  // Node's built-in SQLite. It throws here on Node versions that do not ship it
  // unflagged (before 22.13), which sends us to the file store.
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (file: string) => {
      exec(sql: string): void;
      prepare(sql: string): { get(...args: unknown[]): unknown; run(...args: unknown[]): unknown };
    };
  };
  const db = new DatabaseSync(path.join(DIR, "civio.db"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  );
  const select = db.prepare("SELECT data, updated_at AS updatedAt FROM sessions WHERE id = ?");
  const upsert = db.prepare(
    "INSERT INTO sessions (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  );
  return {
    kind: "sqlite",
    get: (id) => (select.get(id) as { data: string; updatedAt: number } | undefined) ?? null,
    put: (id, data, updatedAt) => void upsert.run(id, data, updatedAt),
  };
}

function openFiles(): SessionStore {
  const dir = path.join(DIR, "sessions");
  mkdirSync(dir, { recursive: true });
  // Ids are validated as UUIDs before they get here, so they are safe as file names.
  const file = (id: string) => path.join(dir, `${id}.json`);
  return {
    kind: "files",
    get(id) {
      try {
        return JSON.parse(readFileSync(file(id), "utf8")) as { data: string; updatedAt: number };
      } catch {
        return null;
      }
    },
    put(id, data, updatedAt) {
      const temp = `${file(id)}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify({ data, updatedAt }));
      renameSync(temp, file(id));
    },
  };
}

let store: SessionStore | undefined;

export function sessions(): SessionStore {
  if (store) return store;
  mkdirSync(DIR, { recursive: true });
  try {
    store = openSqlite();
  } catch {
    store = openFiles();
  }
  return store;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isSessionId = (id: string) => UUID.test(id);
