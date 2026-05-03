-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "compare_image_path" TEXT;

-- AlterTable
ALTER TABLE "vision_cache" ADD COLUMN "compare_image_path" TEXT;
