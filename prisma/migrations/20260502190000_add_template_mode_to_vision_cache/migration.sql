-- Vision v2: tách cache theo template_mode ('image' vs 'text')
-- 2 modes có prompt + input khác → kết quả khác → không trộn cache.
-- Default 'image' = preserve existing rows (backward compat — đang dùng image mode).

-- DropIndex (cả tên do Prisma auto-gen lẫn tên alias từ schema mapping)
DROP INDEX IF EXISTS "vision_cache_image_hash_campaign_id_detection_mode_key";
DROP INDEX IF EXISTS "uq_vision_cache";

-- AlterTable
ALTER TABLE "vision_cache" ADD COLUMN "template_mode" TEXT NOT NULL DEFAULT 'image';

-- CreateIndex (tên auto-gen theo Prisma convention để khớp với schema introspection)
CREATE UNIQUE INDEX "vision_cache_image_hash_campaign_id_detection_mode_template_mode_key" ON "vision_cache"("image_hash", "campaign_id", "detection_mode", "template_mode");
