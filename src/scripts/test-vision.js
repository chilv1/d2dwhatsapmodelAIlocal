/**
 * Test nhanh OpenAI vision so sánh 2 ảnh, không cần WhatsApp.
 *
 * Cách dùng:
 *   npm run test:vision -- <template.jpg> <submission.jpg> ["Tên campaign"]
 */
import { evaluateSubmissionImage } from '../vision.js';

async function main() {
  const [, , templatePath, submissionPath, campaignName] = process.argv;

  if (!templatePath || !submissionPath) {
    console.error(
      'Usage: npm run test:vision -- <template.jpg> <submission.jpg> ["Campaign Name"]',
    );
    process.exit(1);
  }

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
