/**
 * Test nhanh OpenAI vision so sánh 2 ảnh, không cần WhatsApp.
 *
 * Cách dùng:
 *   npm run test:vision -- <template.jpg> <submission.jpg> ["Tên campaign"]
 */
import { isAbsolute, resolve } from 'node:path';
import { config } from '../config.js';
import { evaluateSubmissionImage } from '../vision.js';

function resolveArg(p) {
  if (!p) return p;
  if (isAbsolute(p)) return p;
  // Resolve relative paths from project root (không từ cwd)
  return resolve(config.projectRoot, p.replace(/^\.\//, ''));
}

async function main() {
  const [, , rawTemplate, rawSubmission, campaignName] = process.argv;

  if (!rawTemplate || !rawSubmission) {
    console.error(
      'Usage: npm run bot:test:vision -- <template.jpg> <submission.jpg> ["Campaign Name"]',
    );
    process.exit(1);
  }

  const templatePath = resolveArg(rawTemplate);
  const submissionPath = resolveArg(rawSubmission);

  console.log('📸 So sánh ảnh:');
  console.log(`   Template:    ${templatePath}`);
  console.log(`   Submission:  ${submissionPath}`);
  console.log(`   Campaign:    ${campaignName || 'Test Campaign'}`);
  console.log();

  const result = await evaluateSubmissionImage({
    submissionImagePath: submissionPath,
    templateImagePath: templatePath,
    campaignName: campaignName || 'Test Campaign',
  });

  console.log('✅ Kết quả:');
  console.log(`   Score:           ${result.similarity_score}/100`);
  console.log(`   Đạt chuẩn:       ${result.meets_standard}`);
  console.log(`   Cần gửi lại:     ${result.needs_resubmit}`);
  console.log(`   Khớp:            ${JSON.stringify(result.matches)}`);
  console.log(`   Vấn đề:          ${JSON.stringify(result.issues)}`);
  console.log(`   Phản hồi user:   ${result.feedback_for_user}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
