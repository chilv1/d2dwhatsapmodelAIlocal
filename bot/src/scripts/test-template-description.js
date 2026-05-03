/**
 * Smoke test: generate template description từ ảnh template.
 *
 * Usage:
 *   node bot/src/scripts/test-template-description.js <template.jpg> ["Campaign Name"]
 *
 * Output: pretty-print description + suggested_requirements để admin review.
 */
import { isAbsolute, resolve } from 'node:path';
import { config } from '../config.js';
import { generateTemplateDescription } from '../vision.js';

function resolveArg(p) {
  if (!p) return p;
  if (isAbsolute(p)) return p;
  return resolve(config.projectRoot, p.replace(/^\.\//, ''));
}

async function main() {
  const [, , rawTemplate, campaignName] = process.argv;

  if (!rawTemplate) {
    console.error(
      'Usage: node bot/src/scripts/test-template-description.js <template.jpg> ["Campaign Name"]',
    );
    process.exit(1);
  }

  const templatePath = resolveArg(rawTemplate);
  const name = campaignName || 'Test Campaign';

  console.log('🤖 Generate template description');
  console.log(`   Template: ${templatePath}`);
  console.log(`   Campaign: ${name}`);
  console.log();

  const t0 = Date.now();
  const result = await generateTemplateDescription({
    templateImagePath: templatePath,
    campaignName: name,
  });
  const elapsed = Date.now() - t0;

  console.log(`⏱  Done in ${elapsed}ms\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 DESCRIPTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(result.description);
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ SUGGESTED REQUIREMENTS (${result.suggested_requirements.length} items)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  result.suggested_requirements.forEach((item, i) => {
    const tag = item.required ? '🔴 REQUIRED' : '⚪ optional';
    console.log(`\n${i + 1}. [${tag}] ${item.label}`);
    console.log(`   note: ${item.note}`);
  });

  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 STATS`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Description length:    ${result.description.length} chars`);
  console.log(`   Required items:        ${result.suggested_requirements.filter((r) => r.required).length}`);
  console.log(`   Optional items:        ${result.suggested_requirements.filter((r) => !r.required).length}`);
  console.log(`   Latency:               ${elapsed}ms`);
}

main().catch((err) => {
  console.error('❌', err.message);
  console.error(err.stack);
  process.exit(1);
});
