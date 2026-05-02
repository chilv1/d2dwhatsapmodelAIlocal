/**
 * Test consistency: gọi vision 2 lần với cùng input → verify cùng output.
 * Chứng minh fix temperature=0 + prompt mới hoạt động.
 */
import { evaluateSubmissionImage, evaluateEndOfDayReport } from '../vision.js';
import { execSync } from 'node:child_process';

const DB = '/Users/chilevan/Desktop/CTYAI/data/telecombig.db';

function get(sql) {
  return execSync(`sqlite3 ${DB} "${sql}"`).toString().trim();
}

const campaignName = 'MERCADO_01';
const templatePath = get(
  `SELECT template_image_path FROM campaigns WHERE code='${campaignName}';`,
);
const requirements = get(
  `SELECT template_requirements FROM campaigns WHERE code='${campaignName}';`,
);

// Lấy 1 ảnh user đã gửi gần nhất
const imagePath = get(
  `SELECT image_path FROM submissions WHERE campaign_id = (SELECT id FROM campaigns WHERE code='${campaignName}') ORDER BY id DESC LIMIT 1;`,
);

console.log('🧪 Test consistency vision API\n');
console.log(`  Campaign:      ${campaignName}`);
console.log(`  Template:      ${templatePath.slice(-50)}`);
console.log(`  Test image:    ${imagePath.slice(-50)}`);
console.log(`  Requirements: ${requirements.length} chars\n`);

const results = [];

// Run 4 times: 2x start-of-day + 2x end-of-day, all với cùng image
for (let i = 1; i <= 2; i++) {
  console.log(`━━━ Run ${i}a: campaign_start ━━━`);
  const start = await evaluateSubmissionImage({
    submissionImagePath: imagePath,
    templateImagePath: templatePath,
    campaignName,
    campaignRequirements: requirements,
  });
  console.log(`  Score: ${start.similarity_score}/100 | meets_standard: ${start.meets_standard}`);
  console.log(`  Issues: ${JSON.stringify(start.issues)}`);
  results.push({ run: `${i}a`, type: 'start', score: start.similarity_score, ok: start.meets_standard });

  console.log(`\n━━━ Run ${i}b: campaign_end ━━━`);
  const end = await evaluateEndOfDayReport({
    endImagePath: imagePath,
    templateImagePath: templatePath,
    campaignName,
    campaignRequirements: requirements,
    reportedSubscribers: 25,
    targetSubscribers: 25,
  });
  console.log(`  Score: ${end.evaluation.similarity_score}/100 | meets_standard: ${end.evaluation.meets_standard}`);
  console.log(`  Issues: ${JSON.stringify(end.evaluation.issues)}`);
  results.push({ run: `${i}b`, type: 'end', score: end.evaluation.similarity_score, ok: end.evaluation.meets_standard });
  console.log();
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Tổng kết:');
console.table(results);

const scores = results.map((r) => r.score);
const min = Math.min(...scores);
const max = Math.max(...scores);
const variance = max - min;
console.log(`\n  Min: ${min}, Max: ${max}, Variance: ${variance}`);
if (variance <= 5) {
  console.log('✅ CONSISTENT — variance ≤ 5 điểm OK');
} else if (variance <= 15) {
  console.log('⚠️  Hơi lệch nhưng acceptable (LLM có chút randomness even temp=0)');
} else {
  console.log('❌ INCONSISTENT — variance > 15 điểm, cần debug thêm');
}
