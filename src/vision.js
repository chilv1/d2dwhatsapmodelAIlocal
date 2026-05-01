/**
 * So sánh ảnh team leader gửi với ảnh template chuẩn của campaign
 * dùng OpenAI gpt-4o vision + JSON mode (structured output).
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import OpenAI from 'openai';
import { config } from './config.js';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function fileToDataURL(filepath) {
  const ext = extname(filepath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/jpeg';
  const b64 = readFileSync(filepath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    similarity_score: {
      type: 'integer',
      minimum: 0,
      maximum: 100,
      description: 'Điểm tương đồng với template, 0-100',
    },
    meets_standard: {
      type: 'boolean',
      description: 'True nếu ảnh đạt chuẩn campaign',
    },
    matches: {
      type: 'array',
      items: { type: 'string' },
      description: 'Các yếu tố khớp với template',
    },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Các vấn đề cần khắc phục',
    },
    feedback_for_user: {
      type: 'string',
      description:
        'Tin nhắn ngắn (1-3 câu, tiếng Tây Ban Nha) gửi cho team leader',
    },
    needs_resubmit: {
      type: 'boolean',
      description: 'True nếu cần team leader gửi lại ảnh',
    },
  },
  required: [
    'similarity_score',
    'meets_standard',
    'matches',
    'issues',
    'feedback_for_user',
    'needs_resubmit',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Bạn là chuyên gia QA cho Telecom Big — công ty viễn thông tại Peru.

Nhiệm vụ: so sánh 1 ảnh hiện trường do team leader bán hàng gửi (Ảnh 2) với 1 ảnh TEMPLATE chuẩn của campaign (Ảnh 1), rồi quyết định Ảnh 2 có đạt yêu cầu triển khai campaign không.

Tiêu chí đánh giá:
- Có đầy đủ vật phẩm/banner/poster của campaign theo template
- Bố trí đúng vị trí, đúng thứ tự, đầy đủ
- Promotor (nhân viên) có mặt và đúng đồng phục nếu template yêu cầu
- Địa điểm DF (điểm bán) gọn gàng, sạch sẽ, dễ tiếp cận khách hàng
- Ảnh rõ nét, đủ sáng, không bị che khuất

Quy ước:
- similarity_score >= {THRESHOLD} → meets_standard = true
- feedback_for_user PHẢI viết bằng tiếng Tây Ban Nha (team leader ở Peru), ngắn gọn, hành động cụ thể nếu cần sửa
- Trả về CHÍNH XÁC theo JSON schema được yêu cầu, không thêm field, không bọc text khác.`;

/**
 * Đánh giá 1 submission đầu ngày (ảnh hiện trường vs template).
 * @returns {Promise<{similarity_score:number, meets_standard:boolean, matches:string[], issues:string[], feedback_for_user:string, needs_resubmit:boolean}>}
 */
export async function evaluateSubmissionImage({
  submissionImagePath,
  templateImagePath,
  campaignName,
  campaignRequirements = '',
}) {
  const submissionUrl = fileToDataURL(submissionImagePath);
  const templateUrl = fileToDataURL(templateImagePath);

  const systemPrompt = SYSTEM_PROMPT.replace(
    '{THRESHOLD}',
    String(config.similarityThreshold),
  );

  const userText =
    `Campaign: **${campaignName}**\n\n` +
    `Yêu cầu chi tiết: ${campaignRequirements || 'Theo template'}\n\n` +
    'Ảnh 1 = TEMPLATE chuẩn. Ảnh 2 = ảnh team leader vừa gửi tại điểm bán.\n' +
    'Đánh giá Ảnh 2 so với Ảnh 1 và trả về JSON theo schema.';

  const response = await openai.chat.completions.create({
    model: config.visionModel,
    max_tokens: 1500,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'image_evaluation',
        schema: EVALUATION_SCHEMA,
        strict: true,
      },
    },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '**Ảnh 1 — TEMPLATE chuẩn:**' },
          { type: 'image_url', image_url: { url: templateUrl, detail: 'high' } },
          { type: 'text', text: '**Ảnh 2 — ảnh team leader vừa gửi:**' },
          { type: 'image_url', image_url: { url: submissionUrl, detail: 'high' } },
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const content = response.choices[0].message.content;
  const parsed = JSON.parse(content);
  return parsed;
}

/**
 * Kết hợp đánh giá ảnh cuối ngày + so target.
 * @returns {Promise<{evaluation:object, summary:string}>}
 */
export async function evaluateEndOfDayReport({
  endImagePath,
  templateImagePath,
  campaignName,
  reportedSubscribers,
  targetSubscribers,
}) {
  const evaluation = await evaluateSubmissionImage({
    submissionImagePath: endImagePath,
    templateImagePath,
    campaignName,
    campaignRequirements:
      'Ảnh cuối ngày, chứng minh campaign đã hoàn thành tại điểm bán.',
  });

  const achieved = reportedSubscribers >= targetSubscribers;
  const percent = targetSubscribers
    ? (reportedSubscribers / targetSubscribers) * 100
    : 0;

  let summary;
  if (achieved && evaluation.meets_standard) {
    summary =
      `✅ Campaign *${campaignName}* ĐẠT mục tiêu hôm nay!\n` +
      `Thuê bao: ${reportedSubscribers}/${targetSubscribers} (${percent.toFixed(0)}%)\n` +
      `Ảnh đạt chuẩn (${evaluation.similarity_score}/100). ¡Buen trabajo!`;
  } else if (achieved && !evaluation.meets_standard) {
    summary =
      `⚠️ Số thuê bao ĐẠT (${reportedSubscribers}/${targetSubscribers}) nhưng ẢNH chưa đạt chuẩn (${evaluation.similarity_score}/100).\n` +
      `Vấn đề: ${(evaluation.issues || []).slice(0, 2).join('; ') || 'xem feedback'}\n` +
      `Cần gửi lại ảnh đạt chuẩn để hoàn tất báo cáo.`;
  } else if (!achieved && evaluation.meets_standard) {
    summary =
      `⚠️ Ảnh đạt chuẩn nhưng số thuê bao CHƯA ĐẠT mục tiêu.\n` +
      `Thuê bao: ${reportedSubscribers}/${targetSubscribers} (${percent.toFixed(0)}%)\n` +
      `Cần báo cáo lý do và kế hoạch khắc phục cho ngày mai.`;
  } else {
    summary =
      `❌ Campaign ${campaignName} CHƯA ĐẠT cả 2 tiêu chí.\n` +
      `Thuê bao: ${reportedSubscribers}/${targetSubscribers} (${percent.toFixed(0)}%)\n` +
      `Ảnh: ${evaluation.similarity_score}/100\n` +
      `Cần xem xét lại và báo cáo chi tiết.`;
  }

  return { evaluation, summary };
}
