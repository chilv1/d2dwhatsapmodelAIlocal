-- Vision v2: thêm field text mô tả template (AI-generated, admin-reviewed)
-- Cho phép runtime compare bỏ template image, gửi text thay vì 1500-token ảnh
-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "template_description" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "template_desc_generated_at" DATETIME;
