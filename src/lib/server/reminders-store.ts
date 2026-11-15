import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Reminder subscriptions, one per anonymous session. The email lives only here, never in the
 * session document, and is removed when the person unsubscribes. Same two backends as the
 * sessions store (built-in SQLite, or a JSON file) and the same advice: for a multi-instance
 * deployment swap `open()` for Postgres, the interface is four functions.
 */

export type Reminder = {
  sid: string;
  /** Empty once unsubscribed. */
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  /** Secret in the confirm and unsubscribe links. */
  token: string;
  createdAt: number;
  confirmSentAt: number;
  confirmedAt?: number;
  /** Reminder markers already emailed, so none repeats. */
  sent: string[];
};

export type ReminderStore = {
  get(sid: string): Reminder | null;
  byToken(token: string): Reminder | null;
  put(reminder: Reminder): void;
  all(): Reminder[];
};

const DIR = path.join(process.cwd(), ".data");

function openSqlite(): ReminderStore {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (file: string) => {
      exec(sql: string): void;
      prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[]; run(...args: unknown[]): unknown };
    };
  };
  const db = new DatabaseSync(path.join(DIR, "civio.db"));
  db.exec("CREATE TABLE IF NOT EXISTS reminders (sid TEXT PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL)");
  db.exec("CREATE INDEX IF NOT EXISTS reminders_token ON reminders (token)");
  const bySid = db.prepare("SELECT data FROM reminders WHERE sid = ?");
  const byToken = db.prepare("SELECT data FROM reminders WHERE token = ?");
  const list = db.prepare("SELECT data FROM reminders");
  const upsert = db.prepare(
    "INSERT INTO reminders (sid, token, data) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET token = excluded.token, data = excluded.data",
  );
  const parse = (row: unknown) => (row ? (JSON.parse((row as { data: string }).data) as Reminder) : null);
  return {
    get: (sid) => parse(bySid.get(sid)),
    byToken: (token) => parse(byToken.get(token)),
    put: (r) => void upsert.run(r.sid, r.token, JSON.stringify(r)),
    all: () => list.all().map((row) => parse(row)!),
  };
}

function openFile(): ReminderStore {
  const file = path.join(DIR, "reminders.json");
  const read = (): Reminder[] => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Reminder[];
    } catch {
      return [];
    }
  };
  return {
    get: (sid) => read().find((r) => r.sid === sid) ?? null,
    byToken: (token) => read().find((r) => r.token === token) ?? null,
    put(reminder) {
      const rest = read().filter((r) => r.sid !== reminder.sid);
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify([...rest, reminder]));
      renameSync(temp, file);
    },
    all: read,
  };
}

let store: ReminderStore | undefined;

export function reminders(): ReminderStore {
  if (store) return store;
  mkdirSync(DIR, { recursive: true });
  try {
    store = openSqlite();
  } catch {
    store = openFile();
  }
  return store;
}
