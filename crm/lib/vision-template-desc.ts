/**
 * Generate template description + suggested requirements từ ảnh template.
 *
 * NOTE: Logic phải match `generateTemplateDescription` trong `bot/src/vision.js`.
 * Duplicate có chủ ý — bot là JS, CRM là TS, mỗi side có openai client riêng.
 * Khi update prompt/schema, sửa cả 2 nơi.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import OpenAI from 'openai';
import { getSetting } from '@/lib/settings';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function fileToDataURL(filepath: string): string {
  const ext = extname(filepath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/jpeg';
  const b64 = readFileSync(filepath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

async function getActiveVisionModel(): Promise<string> {
  const dbModel = await getSetting('vision.model', '');
  if (dbModel && dbModel.trim()) return dbModel.trim();
  return process.env.OPENAI_VISION_MODEL || 'gpt-4o';
}

export type SuggestedRequirement = {
  label: string;
  required: boolean;
  note: string;
};

export type TemplateDescriptionResult = {
  description: string;
  suggested_requirements: SuggestedRequirement[];
};

const TEMPLATE_DESCRIPTION_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description:
        'Mô tả CHI TIẾT template — đủ để 1 AI vision khác có thể hình dung mà không cần thấy ảnh. ' +
        'Bao gồm: tổng quan bố cục, từng visual element (vị trí, màu, kích thước, text), background, ' +
        'phong cách ánh sáng. Tiếng Việt, 200-500 chữ.',
    },
    suggested_requirements: {
      type: 'array',
      description:
        'Checklist gợi ý từ template — items mà ảnh hiện trường BẮT BUỘC phải có để pass. ' +
        '5-15 items là hợp lý.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          required: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['label', 'required', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['description', 'suggested_requirements'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT_TEMPLATE_DESC = `Bạn là chuyên gia QA cho Telecom Big (Peru).

Nhiệm vụ: phân tích ảnh TEMPLATE chuẩn của 1 campaign và sinh ra:
1. **description**: text mô tả chi tiết template để 1 AI vision khác có thể "hình dung" mà không cần thấy ảnh.
2. **suggested_requirements**: checklist các item BẮT BUỘC phải có trong ảnh hiện trường để pass.

QUY TẮC:

A. description phải concrete, KHÔNG chung chung:
   - SAI: "Template có standee và promotor"
   - ĐÚNG: "Standee đứng cao ~1.8m bên trái khung hình, màu vàng đậm với chữ '49.90 SOLES/MES' nổi bật ở giữa, logo Bitel trắng trên cùng. Promotor mặc áo polo vàng có logo Bitel ngực trái, đứng giữa khung hình..."

B. suggested_requirements:
   - Mỗi item là 1 visual element CÓ THỂ KIỂM TRA bằng vision (không phải concept trừu tượng)
   - required=true cho item brand-critical (logo, standee chính, đồng phục)
   - required=false cho item optional (vd: balloons, banner phụ)
   - note phải đủ chi tiết để AI runtime nhận diện không nhầm

C. KHÔNG thêm item không thấy trong template. KHÔNG generate yêu cầu chung như "ảnh phải rõ nét" — đó là image quality, không thuộc checklist.

D. Output JSON đúng schema, không thêm field.`;

let _openai: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function generateTemplateDescription(args: {
  templateImagePath: string;
  campaignName: string;
}): Promise<TemplateDescriptionResult> {
  const templateUrl = fileToDataURL(args.templateImagePath);
  const model = await getActiveVisionModel();

  const response = await getClient().chat.completions.create({
    model,
    max_tokens: 2000,
    temperature: 0.2,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'template_description',
        schema: TEMPLATE_DESCRIPTION_SCHEMA,
        strict: true,
      },
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_TEMPLATE_DESC },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Campaign: **${args.campaignName}**\n\n` +
              `Đây là ảnh TEMPLATE chuẩn. Hãy:\n` +
              `1. Mô tả chi tiết (description)\n` +
              `2. Đề xuất checklist các item bắt buộc cho ảnh hiện trường (suggested_requirements)\n\n` +
              `Output JSON theo schema.`,
          },
          {
            type: 'image_url',
            image_url: { url: templateUrl, detail: 'high' },
          },
        ],
      },
    ],
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('OpenAI returned empty response');
  return JSON.parse(content) as TemplateDescriptionResult;
}
