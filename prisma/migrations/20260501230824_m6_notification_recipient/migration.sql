-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "branch_id" INTEGER,
    "digest_daily" BOOLEAN NOT NULL DEFAULT true,
    "alert_reject" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_recipients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "notification_recipients_channel_is_active_idx" ON "notification_recipients"("channel", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_channel_address_branch_id_key" ON "notification_recipients"("channel", "address", "branch_id");
