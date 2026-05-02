-- CreateTable
CREATE TABLE "bot_metrics" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_submissions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_leader_id" INTEGER,
    "campaign_id" INTEGER,
    "promotor_id" INTEGER,
    "submission_type" TEXT NOT NULL,
    "image_path" TEXT NOT NULL,
    "caption" TEXT,
    "gps_latitude" REAL,
    "gps_longitude" REAL,
    "gps_address" TEXT,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluation_result" TEXT NOT NULL DEFAULT 'pending',
    "similarity_score" INTEGER,
    "meets_standard" INTEGER,
    "ai_feedback" TEXT,
    "ai_raw_response" TEXT,
    "reported_subscribers" INTEGER,
    "wa_message_id" TEXT,
    "wa_chat_id" TEXT,
    "wa_sender_number" TEXT,
    "wa_sender_name" TEXT,
    "manual_override" TEXT,
    "override_user_id" INTEGER,
    "override_reason" TEXT,
    "overridden_at" DATETIME,
    "vision_cached" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "submissions_team_leader_id_fkey" FOREIGN KEY ("team_leader_id") REFERENCES "team_leaders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "submissions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "submissions_promotor_id_fkey" FOREIGN KEY ("promotor_id") REFERENCES "promotors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "submissions_override_user_id_fkey" FOREIGN KEY ("override_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_submissions" ("ai_feedback", "ai_raw_response", "campaign_id", "caption", "evaluation_result", "gps_address", "gps_latitude", "gps_longitude", "id", "image_path", "manual_override", "meets_standard", "overridden_at", "override_reason", "override_user_id", "promotor_id", "reported_subscribers", "similarity_score", "submission_type", "submitted_at", "team_leader_id", "wa_chat_id", "wa_message_id", "wa_sender_name", "wa_sender_number") SELECT "ai_feedback", "ai_raw_response", "campaign_id", "caption", "evaluation_result", "gps_address", "gps_latitude", "gps_longitude", "id", "image_path", "manual_override", "meets_standard", "overridden_at", "override_reason", "override_user_id", "promotor_id", "reported_subscribers", "similarity_score", "submission_type", "submitted_at", "team_leader_id", "wa_chat_id", "wa_message_id", "wa_sender_name", "wa_sender_number" FROM "submissions";
DROP TABLE "submissions";
ALTER TABLE "new_submissions" RENAME TO "submissions";
CREATE UNIQUE INDEX "submissions_wa_message_id_key" ON "submissions"("wa_message_id");
CREATE INDEX "submissions_campaign_id_submitted_at_idx" ON "submissions"("campaign_id", "submitted_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "bot_metrics_date_idx" ON "bot_metrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "bot_metrics_date_metric_key" ON "bot_metrics"("date", "metric");
