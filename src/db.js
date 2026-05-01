import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Khởi tạo schema
db.exec(`
CREATE TABLE IF NOT EXISTS branches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  region      TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_leaders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  whatsapp_number TEXT UNIQUE NOT NULL,  -- '51999000001@c.us' format
  branch_id       INTEGER REFERENCES branches(id),
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  code                   TEXT UNIQUE NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  template_image_path    TEXT,
  template_requirements  TEXT,
  target_subscribers     INTEGER DEFAULT 20,
  branch_id              INTEGER REFERENCES branches(id),
  start_date             TEXT,
  end_date               TEXT,
  is_active              INTEGER DEFAULT 1,
  created_at             TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  team_leader_id         INTEGER REFERENCES team_leaders(id),
  campaign_id            INTEGER REFERENCES campaigns(id),
  submission_type        TEXT NOT NULL,         -- 'campaign_start' | 'campaign_end'
  image_path             TEXT NOT NULL,
  caption                TEXT,
  gps_latitude           REAL,
  gps_longitude          REAL,
  gps_address            TEXT,
  submitted_at           TEXT DEFAULT (datetime('now')),
  evaluation_result      TEXT DEFAULT 'pending', -- pending|approved|rejected|needs_review
  similarity_score       INTEGER,
  meets_standard         INTEGER,
  ai_feedback            TEXT,
  ai_raw_response        TEXT,
  reported_subscribers   INTEGER,
  wa_message_id          TEXT UNIQUE,
  wa_chat_id             TEXT,
  wa_sender_number       TEXT,
  wa_sender_name         TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_campaign_date
  ON submissions(campaign_id, submitted_at);

CREATE TABLE IF NOT EXISTS daily_reports (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id                 INTEGER REFERENCES campaigns(id),
  report_date                 TEXT NOT NULL,    -- YYYY-MM-DD
  actual_subscribers          INTEGER DEFAULT 0,
  target_subscribers          INTEGER DEFAULT 20,
  achieved                    INTEGER DEFAULT 0,
  achievement_percent         REAL,
  start_submission_id         INTEGER REFERENCES submissions(id),
  end_submission_id           INTEGER REFERENCES submissions(id),
  summary                     TEXT,
  created_at                  TEXT DEFAULT (datetime('now')),
  UNIQUE(campaign_id, report_date)
);
`);

// ───────── Helpers ─────────

export function getOrCreateTeamLeader(waNumber, name = '') {
  const existing = db
    .prepare('SELECT * FROM team_leaders WHERE whatsapp_number = ?')
    .get(waNumber);
  if (existing) return existing;

  const result = db
    .prepare(
      'INSERT INTO team_leaders (whatsapp_number, name) VALUES (?, ?) RETURNING *',
    )
    .get(waNumber, name || `Leader-${waNumber.slice(0, 6)}`);
  return result;
}

export function findActiveCampaignByCode(code) {
  return db
    .prepare(
      "SELECT * FROM campaigns WHERE UPPER(code) = ? AND is_active = 1",
    )
    .get(code.toUpperCase());
}

export function insertSubmission(data) {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(', ');
  const stmt = db.prepare(
    `INSERT INTO submissions (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
  );
  return stmt.get(...cols.map((c) => data[c]));
}

export function findSubmissionByMessageId(waMessageId) {
  return db
    .prepare('SELECT * FROM submissions WHERE wa_message_id = ?')
    .get(waMessageId);
}

export function findTodayStartSubmission(campaignId) {
  return db
    .prepare(
      `SELECT * FROM submissions
        WHERE campaign_id = ?
          AND submission_type = 'campaign_start'
          AND date(submitted_at) = date('now')
       ORDER BY submitted_at DESC LIMIT 1`,
    )
    .get(campaignId);
}

export function upsertDailyReport({
  campaignId,
  reportDate,
  actualSubscribers,
  targetSubscribers,
  startSubmissionId,
  endSubmissionId,
}) {
  const achieved = actualSubscribers >= targetSubscribers ? 1 : 0;
  const percent = targetSubscribers
    ? (actualSubscribers / targetSubscribers) * 100
    : 0;
  const summary = `${actualSubscribers}/${targetSubscribers} thuê bao (${percent.toFixed(0)}%) - ${
    achieved ? 'ĐẠT' : 'CHƯA ĐẠT'
  }`;

  const existing = db
    .prepare(
      'SELECT id FROM daily_reports WHERE campaign_id = ? AND report_date = ?',
    )
    .get(campaignId, reportDate);

  if (existing) {
    db.prepare(
      `UPDATE daily_reports SET
         actual_subscribers = ?,
         target_subscribers = ?,
         achieved = ?,
         achievement_percent = ?,
         end_submission_id = COALESCE(?, end_submission_id),
         start_submission_id = COALESCE(start_submission_id, ?),
         summary = ?
       WHERE id = ?`,
    ).run(
      actualSubscribers,
      targetSubscribers,
      achieved,
      percent,
      endSubmissionId,
      startSubmissionId,
      summary,
      existing.id,
    );
    return db
      .prepare('SELECT * FROM daily_reports WHERE id = ?')
      .get(existing.id);
  }

  return db
    .prepare(
      `INSERT INTO daily_reports
         (campaign_id, report_date, actual_subscribers, target_subscribers,
          achieved, achievement_percent, start_submission_id, end_submission_id, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      campaignId,
      reportDate,
      actualSubscribers,
      targetSubscribers,
      achieved,
      percent,
      startSubmissionId,
      endSubmissionId,
      summary,
    );
}
