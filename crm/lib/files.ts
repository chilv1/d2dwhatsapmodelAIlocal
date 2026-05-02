/**
 * Helpers convert absolute file path từ DB → URL phục vụ qua /api/files.
 * Submission.imagePath = "/Users/.../data/uploads/123_abc.jpg"
 *   → /api/files/upload/123_abc.jpg
 * Campaign.templateImagePath = "/Users/.../data/templates/template_xxx.jpg"
 *   → /api/files/template/template_xxx.jpg
 */
import { basename } from 'node:path';

/**
 * @param absolutePath path từ Submission.imagePath, Campaign.templateImagePath
 * @returns URL prefix /api/files/{kind}/{filename} hoặc null nếu path không hợp lệ
 */
export function fileUrl(absolutePath: string | null | undefined): string | null {
  if (!absolutePath) return null;
  const filename = basename(absolutePath);
  // Heuristic: path chứa /templates/ → prefix template, else upload
  const kind = absolutePath.includes('/templates/') ? 'template' : 'upload';
  return `/api/files/${kind}/${encodeURIComponent(filename)}`;
}
