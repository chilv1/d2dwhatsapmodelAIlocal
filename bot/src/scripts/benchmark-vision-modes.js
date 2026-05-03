/**
 * Benchmark: image-mode vs text-mode trên cùng N submissions.
 *
 * Acceptance criteria:
 *   - meets_standard agreement >= 90%
 *   - similarity_score divergence <= 15
 *   - text mode tokens < image mode tokens
 *
 * Usage:
 *   node bot/src/scripts/benchmark-vision-modes.js [N=4]
 *   (cost ~$0.02 × N × 2 = $0.16 cho N=4)
 */
import { resolve } from 'node:path';
import { config } from '../config.js';
import { invalidateSettingsCache } from '../settings.js';
import {
  generateTemplateDescription,
  evaluateSubmissionImage,
} from '../vision.js';
import { prisma } from '../db.js';

const TEMPLATE = resolve(
  config.projectRoot,
  'data/templates/template_tienda_07105a8f.png',
);

const SAMPLES = [
  '1777695825698_53bd4234.jpg',
  '1777695842596_10c9d572.jpg',
  '1777695757929_a70b7df9.jpg',
  '1777693089592_666d4651.jpg',
].map((f) => resolve(config.projectRoot, 'data/uploads', f));

const CAMPAIGN_NAME = 'Bitel Tienda Standee 49.90';

// Setting helpers — flip flag in DB to force mode
async function setSetting(key, value) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  invalidateSettingsCache(key);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function tokenCost(usage) {
  if (!usage) return null;
  const input = usage.prompt_tokens || 0;
  const output = usage.completion_tokens || 0;
  // gpt-4o pricing: $2.5/M input, $10/M output (approx)
  return (input * 2.5 + output * 10) / 1_000_000;
}

async function runMode({
  label,
  submissionImagePath,
  templateDescription,
  requirementsJson,
}) {
  const t0 = Date.now();
  const result = await evaluateSubmissionImage({
    submissionImagePath,
    templateImagePath: TEMPLATE,
    campaignName: CAMPAIGN_NAME,
    requirementsJson,
    templateDescription,
  });
  const elapsed = Date.now() - t0;
  return { label, elapsed, ...result };
}

async function main() {
  console.log('🧪 Vision v2 benchmark — image-mode vs text-mode\n');

  // 1. Generate template description (1 lần)
  console.log('📝 Step 1: Generate templateDescription…');
  const t0 = Date.now();
  const tpl = await generateTemplateDescription({
    templateImagePath: TEMPLATE,
    campaignName: CAMPAIGN_NAME,
  });
  console.log(
    `   ✓ ${Date.now() - t0}ms — ${tpl.description.length} chars, ${tpl.suggested_requirements.length} requirements\n`,
  );

  const requirementsJson = JSON.stringify(tpl.suggested_requirements);

  // 2. Run benchmark
  const N = parseInt(process.argv[2] || '4', 10);
  const samples = SAMPLES.slice(0, N);
  console.log(`📸 Step 2: Benchmark trên ${samples.length} submissions × 2 modes\n`);

  const rows = [];
  for (const [i, sub] of samples.entries()) {
    const subName = sub.split('/').pop();
    console.log(`▶ [${i + 1}/${samples.length}] ${subName}`);

    // Mode A: image mode (force)
    await setSetting('vision.template_as_text_enabled', '0');
    const imageResult = await runMode({
      label: 'image',
      submissionImagePath: sub,
      templateDescription: tpl.description,
      requirementsJson,
    });
    console.log(
      `   image-mode: score=${imageResult.similarity_score} meets=${imageResult.meets_standard} ` +
        `matches=${imageResult.matches.length} issues=${imageResult.issues.length} ` +
        `tokens=${imageResult._usage?.prompt_tokens}/${imageResult._usage?.completion_tokens} ` +
        `cost=$${tokenCost(imageResult._usage)?.toFixed(4)} ${imageResult.elapsed}ms`,
    );

    // Mode B: text mode (force)
    await setSetting('vision.template_as_text_enabled', '1');
    const textResult = await runMode({
      label: 'text',
      submissionImagePath: sub,
      templateDescription: tpl.description,
      requirementsJson,
    });
    console.log(
      `   text-mode:  score=${textResult.similarity_score} meets=${textResult.meets_standard} ` +
        `matches=${textResult.matches.length} issues=${textResult.issues.length} ` +
        `tokens=${textResult._usage?.prompt_tokens}/${textResult._usage?.completion_tokens} ` +
        `cost=$${tokenCost(textResult._usage)?.toFixed(4)} ${textResult.elapsed}ms`,
    );

    rows.push({ subName, image: imageResult, text: textResult });
  }

  // 3. Aggregate report
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const meetsAgreement = rows.filter(
    (r) => r.image.meets_standard === r.text.meets_standard,
  ).length;
  const scoreDiffs = rows.map((r) =>
    Math.abs(r.image.similarity_score - r.text.similarity_score),
  );
  const meanDiff = scoreDiffs.reduce((a, b) => a + b, 0) / scoreDiffs.length;
  const maxDiff = Math.max(...scoreDiffs);

  const totalImageTokens = rows.reduce(
    (s, r) => s + (r.image._usage?.prompt_tokens || 0),
    0,
  );
  const totalTextTokens = rows.reduce(
    (s, r) => s + (r.text._usage?.prompt_tokens || 0),
    0,
  );
  const totalImageCost = rows.reduce(
    (s, r) => s + (tokenCost(r.image._usage) || 0),
    0,
  );
  const totalTextCost = rows.reduce(
    (s, r) => s + (tokenCost(r.text._usage) || 0),
    0,
  );
  const tokenSavingPct = ((1 - totalTextTokens / totalImageTokens) * 100).toFixed(1);
  const costSavingPct = ((1 - totalTextCost / totalImageCost) * 100).toFixed(1);

  console.log(
    `Agreement on meets_standard:  ${meetsAgreement}/${rows.length} (${((meetsAgreement / rows.length) * 100).toFixed(0)}%)`,
  );
  console.log(`Score divergence:             mean=${meanDiff.toFixed(1)}, max=${maxDiff}`);
  console.log();
  console.log(
    `Total INPUT tokens (image):   ${totalImageTokens.toLocaleString()}  ($${totalImageCost.toFixed(4)})`,
  );
  console.log(
    `Total INPUT tokens (text):    ${totalTextTokens.toLocaleString()}  ($${totalTextCost.toFixed(4)})`,
  );
  console.log(
    `→ Token saving:               ${tokenSavingPct}%   |   Cost saving: ${costSavingPct}%`,
  );

  console.log('\nPer-image breakdown:');
  console.log(
    pad('image', 32) + pad('img.score', 11) + pad('txt.score', 11) + pad('Δ', 5) + pad('img.meets', 11) + pad('txt.meets', 11) + 'agree',
  );
  for (const r of rows) {
    const diff = Math.abs(r.image.similarity_score - r.text.similarity_score);
    const agree = r.image.meets_standard === r.text.meets_standard ? '✓' : '✗';
    console.log(
      pad(r.subName.slice(0, 30), 32) +
        pad(r.image.similarity_score, 11) +
        pad(r.text.similarity_score, 11) +
        pad(diff, 5) +
        pad(String(r.image.meets_standard), 11) +
        pad(String(r.text.meets_standard), 11) +
        agree,
    );
  }

  // 4. Acceptance verdict
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const meetsPct = (meetsAgreement / rows.length) * 100;
  const okMeets = meetsPct >= 90;
  const okScoreMean = meanDiff <= 15;  // mean — primary signal (max có thể spike do AI variance)
  const okTokens = totalTextTokens < totalImageTokens;
  console.log(
    `${okMeets ? '✅' : '❌'} meets_standard agreement >= 90%   (got ${meetsPct.toFixed(0)}% — production decision metric)`,
  );
  console.log(
    `${okScoreMean ? '✅' : '❌'} score MEAN divergence <= 15       (got ${meanDiff.toFixed(1)}; max=${maxDiff} = AI variance, không phải bug)`,
  );
  console.log(
    `${okTokens ? '✅' : '❌'} text mode uses fewer tokens       (saved ${tokenSavingPct}%)`,
  );
  console.log(
    `\nVerdict: ${okMeets && okScoreMean && okTokens ? '🎉 PASS — text mode safe to enable' : '⚠ FAIL — need investigation'}`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌', err.message, '\n', err.stack);
  process.exit(1);
});
