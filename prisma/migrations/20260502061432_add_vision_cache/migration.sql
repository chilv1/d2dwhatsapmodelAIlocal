-- CreateTable
CREATE TABLE "vision_cache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "image_hash" TEXT NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "detection_mode" BOOLEAN NOT NULL DEFAULT false,
    "evaluation_json" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_hit_at" DATETIME
);

-- CreateIndex
CREATE INDEX "vision_cache_campaign_id_idx" ON "vision_cache"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "vision_cache_image_hash_campaign_id_detection_mode_key" ON "vision_cache"("image_hash", "campaign_id", "detection_mode");
