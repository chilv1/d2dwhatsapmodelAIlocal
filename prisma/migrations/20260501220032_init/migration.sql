-- CreateTable
CREATE TABLE "branches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "team_leaders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "branch_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_leaders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template_image_path" TEXT,
    "template_requirements" TEXT,
    "target_subscribers" INTEGER NOT NULL DEFAULT 20,
    "branch_id" INTEGER,
    "start_date" DATETIME,
    "end_date" DATETIME,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alert_threshold" INTEGER NOT NULL DEFAULT 50,
    "slack_webhook_url" TEXT,
    CONSTRAINT "campaigns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "promotors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "branch_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "submissions" (
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
    CONSTRAINT "submissions_team_leader_id_fkey" FOREIGN KEY ("team_leader_id") REFERENCES "team_leaders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "submissions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "submissions_promotor_id_fkey" FOREIGN KEY ("promotor_id") REFERENCES "promotors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "submissions_override_user_id_fkey" FOREIGN KEY ("override_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaign_id" INTEGER,
    "report_date" DATETIME NOT NULL,
    "actual_subscribers" INTEGER NOT NULL DEFAULT 0,
    "target_subscribers" INTEGER NOT NULL DEFAULT 20,
    "achieved" BOOLEAN NOT NULL DEFAULT false,
    "achievement_percent" REAL,
    "start_submission_id" INTEGER,
    "end_submission_id" INTEGER,
    "summary" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "daily_reports_start_submission_id_fkey" FOREIGN KEY ("start_submission_id") REFERENCES "submissions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "daily_reports_end_submission_id_fkey" FOREIGN KEY ("end_submission_id") REFERENCES "submissions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "branch_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" DATETIME,
    CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "old_value" TEXT,
    "new_value" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_msg" TEXT,
    "sent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered_by_user_id" INTEGER,
    CONSTRAINT "notification_logs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "team_leaders_whatsapp_number_key" ON "team_leaders"("whatsapp_number");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_code_key" ON "campaigns"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promotors_employee_code_key" ON "promotors"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_wa_message_id_key" ON "submissions"("wa_message_id");

-- CreateIndex
CREATE INDEX "submissions_campaign_id_submitted_at_idx" ON "submissions"("campaign_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_campaign_id_report_date_key" ON "daily_reports"("campaign_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notification_logs_channel_created_at_idx" ON "notification_logs"("channel", "created_at");
