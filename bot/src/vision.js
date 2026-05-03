/**
 * So sánh ảnh team leader gửi với ảnh template chuẩn của campaign
 * dùng OpenAI gpt-4o vision + JSON mode (structured output).
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import OpenAI from 'openai';
import { config } from './config.js';
import { getSetting } from './settings.js';
import { ES } from './i18n-es.js';

/**
 * Resolve model: DB setting `vision.model` > env OPENAI_VISION_MODEL > 'gpt-4o' default.
 * Cho phép admin swap model qua CRM mà không cần đổi env + restart.
 */
async function getActiveVisionModel() {
  const dbModel = await getSetting('vision.model', '');
  if (dbModel && dbModel.trim()) return dbModel.trim();
  return config.visionModel || 'gpt-4o';
}

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

/**
 * Build structured requirements text từ JSON array (Option A — Structured Requirements UI).
 * @param {string|null|undefined} jsonStr — chuỗi JSON từ campaign.requirementsJson
 * @returns {string|null} — text đã format hoặc null nếu invalid/empty
 */
function buildStructuredRequirements(jsonStr) {
  if (!jsonStr) return null;
  let items;
  try {
    items = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (!Array.isArray(items) || items.length === 0) return null;

  const required = items.filter((it) => it && it.required && it.label);
  const optional = items.filter((it) => it && !it.required && it.label);
  if (required.length === 0 && optional.length === 0) return null;

  let out = '';
  if (required.length) {
    out += `[REQUIRED — ${required.length} item bắt buộc, mỗi item missing = score giảm mạnh]\n`;
    required.forEach((it, i) => {
      out += `${i + 1}. label: "${it.label}"\n`;
      out += `   Mô tả nhận dạng: ${it.note || '(không có — chỉ dùng label)'}\n`;
    });
  }
  if (optional.length) {
    if (required.length) out += '\n';
    out += `[OPTIONAL — ${optional.length} item không bắt buộc, missing không ảnh hưởng]\n`;
    optional.forEach((it, i) => {
      out += `${required.length + i + 1}. label: "${it.label}"\n`;
      out += `   Mô tả nhận dạng: ${it.note || '(không có — chỉ dùng label)'}\n`;
    });
  }
  out +=
    '\nCách kiểm tra:\n' +
    '- Với MỖI item ở trên: dùng "Mô tả nhận dạng" để tìm trong Ảnh 2 (KHÔNG đoán mò từ template).\n' +
    '- Nếu tìm thấy → ghi EXACT label (giữ nguyên dấu nháy, hoa thường) vào "matches".\n' +
    '- Nếu KHÔNG thấy item REQUIRED → ghi EXACT label đó vào "issues".\n' +
    '- KHÔNG thêm bất kỳ text nào ngoài label vào matches/issues.';
  return out;
}

// GPS extraction schema (shared cho cả 2 modes — Hướng 1 strict + Hướng 2 detection)
// Dùng để OCR NoteCam-style stamp text trong ảnh ("Latitud: -10.92...", v.v.)
const GPS_SCHEMA_PROPS = {
  type: 'object',
  properties: {
    latitude: { type: ['number', 'null'] },
    longitude: { type: ['number', 'null'] },
    elevation_m: { type: ['number', 'null'] },
    accuracy_m: { type: ['number', 'null'] },
    captured_at: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
  },
  required: ['latitude', 'longitude', 'elevation_m', 'accuracy_m', 'captured_at', 'note'],
  additionalProperties: false,
};

const GPS_PROMPT_INSTRUCTIONS = `

GPS extraction (BẮT BUỘC kiểm tra Ảnh 2):
Tìm overlay text với format kiểu NoteCam/cam app:
  "Latitud: -10.925708" hoặc "Lat: -10.92..."
  "Longitud: -74.873829" hoặc "Long: -74.87..."
  "Elevación: 524.09 m" (optional)
  "Precisión: 4.75 m" (optional)
  "Tiempo: 01-05-2026 16:55:59" (optional)
  "Nota: JUNCD10" (optional)

Trả về:
- gps.latitude: số decimal (NEGATIVE nếu Nam/Tây hemisphere — Peru luôn negative cho cả lat lẫn lng)
- gps.longitude: số decimal (negative)
- gps.elevation_m: số mét (chỉ số, bỏ "±X m")
- gps.accuracy_m: số mét precision
- gps.captured_at: chuỗi nguyên dạng "01-05-2026 16:55:59"
- gps.note: chuỗi nguyên dạng (vd "JUNCD10")

Nếu Ảnh 2 KHÔNG có overlay text GPS → tất cả fields = null.
KHÔNG suy đoán, KHÔNG generate fake coords. Chỉ extract khi text rõ ràng.
Validate: lat ∈ [-90, 90], lng ∈ [-180, 180]. Nếu out of range → null.`;

const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    gps: GPS_SCHEMA_PROPS,
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
    issue_boxes: {
      type: 'array',
      description:
        'Bounding boxes (normalized 0-1, top-left origin) chỉ vị trí TRÊN ẢNH 2 (user image) ' +
        'nơi missing item NÊN có. Mỗi entry có "label" map với 1 string trong "issues". ' +
        'Để mảng RỖNG nếu không xác định chắc chắn vị trí — KHÔNG đoán bừa.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          x: { type: 'number', minimum: 0, maximum: 1 },
          y: { type: 'number', minimum: 0, maximum: 1 },
          w: { type: 'number', minimum: 0, maximum: 1 },
          h: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['label', 'x', 'y', 'w', 'h'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'gps',
    'similarity_score',
    'meets_standard',
    'matches',
    'issues',
    'feedback_for_user',
    'needs_resubmit',
    'issue_boxes',
  ],
  additionalProperties: false,
};

// Strict prompt cho structured CHECKLIST (Option A — requirementsJson)
const SYSTEM_PROMPT_STRUCTURED = `Bạn là chuyên gia QA cho Telecom Big (Peru).

NHIỆM VỤ: dựa vào CHECKLIST do user cung cấp, kiểm tra Ảnh 2 (do team leader gửi) có đủ các item không. Ảnh 1 (template) CHỈ để tham khảo phong cách (màu, bố cục), KHÔNG phải nguồn yêu cầu.

QUY TẮC TUYỆT ĐỐI — VI PHẠM = OUTPUT SAI:

A. CHỈ kiểm tra các item có TRONG CHECKLIST. TUYỆT ĐỐI KHÔNG bịa thêm item như "Logo Bitel", "Centro de Atención", "Standee 50%"... nếu CHECKLIST không liệt kê.

B. Với MỖI item trong CHECKLIST, output dưới dạng tên item (label hoặc tên ngắn user dùng):
   - Nếu THẤY trong Ảnh 2 → cho vào "matches".
   - Nếu KHÔNG THẤY và item là REQUIRED/Bắt buộc → cho vào "issues".
   - Nếu KHÔNG THẤY và item là OPTIONAL → bỏ qua, không ghi đâu cả.

C. KHÔNG suy diễn: thấy số "79.90" trên 1 banner khuyến mãi 50% dscto → KHÔNG được tính là "Standee 79.90" nếu mô tả khác. Phải khớp ĐÚNG mô tả/identification.

D. matches và feedback PHẢI nhất quán: nếu "Standee X" trong matches thì feedback KHÔNG được nói "Falta Standee X".

E. issue_boxes (BBOX OVERLAY): với MỖI item trong "issues", nếu xác định ĐƯỢC vị trí TRÊN ẢNH 2 nơi item NÊN có (vd: vùng tường trống nơi standee thiếu, khu vực promotor không có biển hiệu) → thêm 1 entry { label, x, y, w, h } với toạ độ NORMALIZED 0-1 (gốc top-left, trục y xuống). label phải KHỚP CHÍNH XÁC với 1 string trong "issues". KHÔNG ĐOÁN BỪA — nếu không chắc vị trí thì BỎ QUA item đó (issue_boxes có thể có ít entry hơn issues, hoặc rỗng []). Box sai còn tệ hơn không có box.

CÔNG THỨC TÍNH similarity_score (0–100) — BẮT BUỘC TUÂN THỦ:

Gọi R = tổng số REQUIRED, F = số REQUIRED có trong matches.

- R = 0: score = 85 (mặc định khi không có REQUIRED).
- R > 0 và F = R (đủ tất cả REQUIRED): score = 85–100 (90 nếu rõ ràng, 100 nếu hoàn hảo).
- R > 0 và F = R − 1 (thiếu 1 REQUIRED): score = 40–55.
- R > 0 và F < R − 1 (thiếu ≥ 2 REQUIRED): score = 10–30.
- R > 0 và F = 0 (không có REQUIRED nào): score = 0–10.

meets_standard = true ⟺ score >= {THRESHOLD} VÀ F = R (đủ tất cả REQUIRED).
Nếu thiếu BẤT KỲ REQUIRED nào → meets_standard = false (bất kể score).

OUTPUT FORMAT:
- feedback_for_user: tiếng Tây Ban Nha, 1–2 câu, nếu có issues phải gọi tên item bị thiếu (đúng tên trong checklist).
- needs_resubmit = true khi meets_standard = false.
- Trả về JSON đúng schema, không thêm field.${GPS_PROMPT_INSTRUCTIONS}`;

// Soft prompt cho text fallback (legacy campaigns chưa migrate sang structured editor)
const SYSTEM_PROMPT_TEXT = `Bạn là chuyên gia QA cho Telecom Big — công ty viễn thông tại Peru.

Nhiệm vụ: so sánh Ảnh 2 (team leader gửi) với Ảnh 1 (template chuẩn) + đánh giá theo "YÊU CẦU CỤ THỂ" do user mô tả bằng text.

QUY TẮC:
1. Bạn CHỈ được đánh giá theo "YÊU CẦU CỤ THỂ" mà user cung cấp. KHÔNG TỰ THÊM tiêu chí.
2. Phân biệt REQUIRED và OPTIONAL trong text:
   - "Bắt buộc / Required / Phải có" → REQUIRED, missing = trừ điểm + ghi vào "issues"
   - "Không bắt buộc / Optional / Tuỳ chọn / Có thể có hoặc không" → OPTIONAL, missing KHÔNG trừ điểm, KHÔNG ghi "issues"
3. Item CÓ MẶT trong ảnh → ghi vào "matches".
4. Đánh giá ổn định: cùng ảnh + cùng yêu cầu → cùng điểm số.

Cách tính similarity_score (0–100):
- Tất cả REQUIRED có mặt + ảnh rõ → 80–100
- Tất cả REQUIRED có mặt nhưng góc/ánh sáng kém → 70–80
- Thiếu 1 REQUIRED → 40–60
- Thiếu nhiều REQUIRED → < 40
- OPTIONAL không tính điểm trừ

meets_standard = true ⟺ score >= {THRESHOLD} VÀ tất cả REQUIRED đều có.
matches và feedback phải nhất quán.

feedback_for_user: tiếng Tây Ban Nha, 1–2 câu. Trả về JSON đúng schema.${GPS_PROMPT_INSTRUCTIONS}`;

// ──────────────── Hướng 2: Detection-only mode ────────────────
// Schema + prompt khi setting `vision.detection_mode_enabled` = '1'.
// AI CHỈ trả về detections per item — code tính score deterministic.

const DETECTION_SCHEMA = {
  type: 'object',
  properties: {
    gps: GPS_SCHEMA_PROPS,
    detections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          found: { type: 'boolean' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string' },
        },
        required: ['label', 'found', 'confidence', 'evidence'],
        additionalProperties: false,
      },
    },
    image_quality: { type: 'string', enum: ['good', 'fair', 'poor'] },
    feedback_for_user: { type: 'string' },
  },
  required: ['gps', 'detections', 'image_quality', 'feedback_for_user'],
  additionalProperties: false,
};

const SYSTEM_PROMPT_DETECTION = `Bạn là AI vision detector cho Telecom Big (Peru).

NHIỆM VỤ: với MỖI item trong CHECKLIST, trả lời CÓ trong Ảnh 2 hay KHÔNG. KHÔNG tính score, code sẽ làm.

QUY TẮC:
1. \`detections\` PHẢI có ĐÚNG N phần tử = số item trong CHECKLIST, theo đúng thứ tự.
2. Mỗi detection:
   - label: copy y nguyên label từ checklist (giữ dấu, hoa thường)
   - found: true/false
   - confidence: 'high' (chắc chắn), 'medium' (có thể nhưng hơi mờ), 'low' (đoán)
   - evidence: 1 câu giải thích, vd "Standee vàng FLASH 49.90 rõ bên trái cửa" hoặc "Không có standee với chữ 50% dscto"
3. CẤM thêm/bớt item ngoài checklist.
4. image_quality:
   - 'good': rõ nét, đủ sáng, đứng gần
   - 'fair': hơi xa hoặc hơi mờ nhưng đọc được
   - 'poor': mờ, ngược sáng, hoặc quá xa
5. feedback_for_user: tiếng Tây Ban Nha 1-2 câu. Nếu có item not found → gọi tên item đó.

Trả về JSON đúng schema.${GPS_PROMPT_INSTRUCTIONS}`;

/**
 * Tính similarity_score + meets_standard từ detections (deterministic, no AI).
 * Anti-bịa: chỉ giữ detections có label match checklist.
 */
function computeScoreFromDetections({
  detections,
  requirementsJson,
  imageQuality,
  threshold,
}) {
  const checklist = JSON.parse(requirementsJson);
  const checklistLabels = new Set(checklist.map((c) => c.label));
  const requiredLabels = checklist
    .filter((c) => c.required)
    .map((c) => c.label);

  // Anti-bịa: lọc detections chỉ giữ items có trong checklist
  const validDetections = (detections || []).filter((d) =>
    checklistLabels.has(d.label),
  );

  const found = new Set(
    validDetections.filter((d) => d.found).map((d) => d.label),
  );
  const F = requiredLabels.filter((l) => found.has(l)).length;
  const R = requiredLabels.length;

  let score;
  if (R === 0) {
    score = imageQuality === 'good' ? 90 : imageQuality === 'fair' ? 80 : 60;
  } else if (F === R) {
    score = imageQuality === 'good' ? 95 : imageQuality === 'fair' ? 85 : 75;
  } else if (F === R - 1) {
    score = 50;
  } else if (F === 0) {
    score = 5;
  } else {
    score = 25;
  }

  const meets_standard = F === R && score >= threshold;
  const matches = [...found];
  const issues = requiredLabels.filter((l) => !found.has(l));

  return {
    similarity_score: score,
    meets_standard,
    matches,
    issues,
    needs_resubmit: !meets_standard,
    _detections: validDetections,
    _image_quality: imageQuality,
  };
}

/**
 * Detection-only mode: AI returns per-item found/not-found + confidence,
 * code computes score via formula.
 *
 * v2: nếu templateDescription truyền vào + text mode active → bỏ template image,
 * chỉ gửi description text (~50% token saving). Ngược lại fallback image mode.
 */
async function runDetectionMode({
  submissionUrl,
  templateUrl,
  templateDescription,
  campaignName,
  structured,
  requirementsJson,
  useTextMode,
}) {
  const userContent = buildUserContent({
    submissionUrl,
    templateUrl,
    templateDescription,
    campaignName,
    requirementsBlock: structured,
    requirementsHeading: 'CHECKLIST',
    instructions:
      'Trả về detections cho TỪNG item trong CHECKLIST theo schema. ' +
      'Nếu thấy item rõ ràng trong ẢNH HIỆN TRƯỜNG → found=true, confidence=high. ' +
      'Mơ hồ → confidence=medium/low.',
    useTextMode,
  });

  const response = await openai.chat.completions.create({
    model: await getActiveVisionModel(),
    max_tokens: 1500,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'detection_result',
        schema: DETECTION_SCHEMA,
        strict: true,
      },
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_DETECTION },
      { role: 'user', content: userContent },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  const computed = computeScoreFromDetections({
    detections: parsed.detections,
    requirementsJson,
    imageQuality: parsed.image_quality,
    threshold: config.similarityThreshold,
  });

  return {
    similarity_score: computed.similarity_score,
    meets_standard: computed.meets_standard,
    matches: computed.matches,
    issues: computed.issues,
    feedback_for_user: parsed.feedback_for_user,
    needs_resubmit: computed.needs_resubmit,
    gps: parsed.gps || null,
    _detections: computed._detections,
    _image_quality: computed._image_quality,
    _templateMode: useTextMode ? 'text' : 'image',
    _usage: response.usage || null,
  };
}

// ──────────────── Vision v2: shared message builder + text mode ────────────────
// Cấu trúc messages tối ưu cho OpenAI prompt caching:
// - System prompt đứng đầu (cached, không đổi giữa calls)
// - User content[] có cacheable prefix (per-campaign) trước, variable suffix (user image) cuối
// - OpenAI tự cache prefix > 1024 tokens trong ~5 phút → giảm 50% input cost cho cached portion

/**
 * Build user message content array.
 *
 * @param {object} args
 * @param {string} args.submissionUrl — data URL của ảnh user (luôn ở cuối, KHÔNG cached)
 * @param {string|null} args.templateUrl — data URL template (chỉ dùng khi !useTextMode)
 * @param {string|null} args.templateDescription — text mô tả template (chỉ dùng khi useTextMode)
 * @param {string} args.campaignName
 * @param {string} args.requirementsBlock — checklist text hoặc requirements text
 * @param {string} args.requirementsHeading — vd 'CHECKLIST' hoặc 'YÊU CẦU CỤ THỂ'
 * @param {string} args.instructions — text hướng dẫn cuối block
 * @param {boolean} args.useTextMode — true = bỏ template image, dùng description
 * @returns {Array} OpenAI content array
 */
function buildUserContent({
  submissionUrl,
  templateUrl,
  templateDescription,
  campaignName,
  requirementsBlock,
  requirementsHeading,
  instructions,
  useTextMode,
}) {
  const sep = '═══════════════════════════════════════';

  const cacheablePrefix = [];

  // Block 1: campaign + checklist (cacheable per-campaign)
  cacheablePrefix.push({
    type: 'text',
    text:
      `Campaign: **${campaignName}**\n\n` +
      `${sep}\n${requirementsHeading}:\n${sep}\n${requirementsBlock}\n${sep}`,
  });

  // Block 2: template — text hoặc image
  if (useTextMode) {
    cacheablePrefix.push({
      type: 'text',
      text:
        `\n📋 TEMPLATE DESCRIPTION (text thay cho image — Vision v2):\n${sep}\n` +
        `${templateDescription}\n${sep}\n` +
        `Dùng description trên làm GROUND TRUTH cho template. Không có ảnh template trong call này.`,
    });
  } else {
    cacheablePrefix.push({ type: 'text', text: '\n**Ảnh TEMPLATE chuẩn:**' });
    cacheablePrefix.push({
      type: 'image_url',
      image_url: { url: templateUrl, detail: 'high' },
    });
  }

  // Block 3: instructions (cacheable)
  cacheablePrefix.push({
    type: 'text',
    text: `\n${instructions}`,
  });

  // Block 4 (LAST — variable per submission, NOT cached):
  cacheablePrefix.push({
    type: 'text',
    text: '\n**📸 ẢNH HIỆN TRƯỜNG (team leader vừa gửi):**',
  });
  cacheablePrefix.push({
    type: 'image_url',
    image_url: { url: submissionUrl, detail: 'high' },
  });

  return cacheablePrefix;
}

/**
 * Quyết định text mode có nên active không.
 * Điều kiện: templateDescription tồn tại + setting `vision.template_as_text_enabled` = '1'.
 */
async function shouldUseTextMode(templateDescription) {
  if (!templateDescription || !templateDescription.trim()) return false;
  const enabled = await getSetting('vision.template_as_text_enabled', '1');
  return enabled === '1';
}

// ──────────────── Vision v2: Template description generation ────────────────
// 1-time call khi admin upload template. Generate text description + suggested
// requirements checklist. Admin review/edit trước khi save → lock vào DB.
// Runtime compare sẽ dùng text này thay vì gửi template image (~50% token saving).

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
          label: {
            type: 'string',
            description: 'Tên ngắn item, vd "Standee 49.90 vàng"',
          },
          required: {
            type: 'boolean',
            description: 'true nếu missing = fail submission',
          },
          note: {
            type: 'string',
            description:
              'Mô tả nhận dạng chi tiết để AI runtime tìm trong ảnh, vd "Standee đứng cao, màu vàng đậm, có giá 49.90 soles, logo Bitel trên cùng"',
          },
        },
        required: ['label', 'required', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['description', 'suggested_requirements'],
  additionalProperties: false,
};

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

/**
 * Sinh template description + suggested requirements từ ảnh template.
 * 1-time call khi admin upload/edit template. Result được admin review/edit trước khi save.
 * @param {string} templateImagePath
 * @param {string} campaignName
 * @returns {Promise<{description:string, suggested_requirements:Array<{label:string,required:boolean,note:string}>}>}
 */
export async function generateTemplateDescription({
  templateImagePath,
  campaignName,
}) {
  const templateUrl = fileToDataURL(templateImagePath);

  const response = await openai.chat.completions.create({
    model: await getActiveVisionModel(),
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
              `Campaign: **${campaignName}**\n\n` +
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
  return JSON.parse(content);
}

/**
 * Đánh giá 1 submission đầu ngày (ảnh hiện trường vs template).
 * @returns {Promise<{similarity_score:number, meets_standard:boolean, matches:string[], issues:string[], feedback_for_user:string, needs_resubmit:boolean}>}
 */
export async function evaluateSubmissionImage({
  submissionImagePath,
  templateImagePath,
  campaignName,
  campaignRequirements = '',
  requirementsJson = null,
  templateDescription = null,  // v2: text mô tả template (admin-curated). Null = fallback image mode.
}) {
  const submissionUrl = fileToDataURL(submissionImagePath);
  const useTextMode = await shouldUseTextMode(templateDescription);
  // Image mode cần load template image. Text mode bỏ qua → tiết kiệm I/O + tokens.
  const templateUrl = useTextMode ? null : fileToDataURL(templateImagePath);

  // Branch theo input type — structured CHECKLIST vs text fallback
  const structured = buildStructuredRequirements(requirementsJson);
  const useStructured = !!structured;

  // Hướng 2 toggle — chỉ áp dụng cho structured input
  const detectionEnabled =
    (await getSetting('vision.detection_mode_enabled', '0')) === '1';
  if (useStructured && detectionEnabled) {
    return runDetectionMode({
      submissionUrl,
      templateUrl,
      templateDescription,
      campaignName,
      structured,
      requirementsJson,
      useTextMode,
    });
  }

  const basePrompt = useStructured ? SYSTEM_PROMPT_STRUCTURED : SYSTEM_PROMPT_TEXT;
  const systemPrompt = basePrompt.replace(
    '{THRESHOLD}',
    String(config.similarityThreshold),
  );

  const requirementsBlock =
    structured ||
    campaignRequirements ||
    '(Không có yêu cầu cụ thể — đánh giá theo template)';

  const instructions = useStructured
    ? 'Quy trình BẮT BUỘC:\n' +
      '1. Duyệt qua TỪNG item trong CHECKLIST trên (theo đúng thứ tự).\n' +
      '2. Với mỗi item: dùng "Mô tả" để tìm trong ẢNH HIỆN TRƯỜNG.\n' +
      '3. Nếu thấy → ghi exact label vào "matches". Nếu KHÔNG thấy + REQUIRED → ghi exact label vào "issues".\n' +
      '4. KHÔNG thêm item ngoài CHECKLIST vào matches/issues.\n' +
      '5. Tính score theo CÔNG THỨC trong system prompt.\n\n' +
      'Trả về JSON theo schema.'
    : 'Hãy đánh giá ẢNH HIỆN TRƯỜNG theo "YÊU CẦU CỤ THỂ" ở trên.\n' +
      'Chỉ trừ điểm cho REQUIRED items missing. OPTIONAL missing KHÔNG trừ điểm.\n' +
      'Trả về JSON theo schema.';

  const userContent = buildUserContent({
    submissionUrl,
    templateUrl,
    templateDescription,
    campaignName,
    requirementsBlock,
    requirementsHeading: useStructured
      ? 'CHECKLIST (NGUỒN DUY NHẤT — chỉ check các item dưới đây)'
      : 'YÊU CẦU CỤ THỂ',
    instructions,
    useTextMode,
  });

  const response = await openai.chat.completions.create({
    model: await getActiveVisionModel(),
    max_tokens: 1500,
    temperature: 0,  // ⭐ Deterministic — cùng input → cùng output
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
      { role: 'user', content: userContent },
    ],
  });

  const content = response.choices[0].message.content;
  const parsed = JSON.parse(content);
  parsed.issue_boxes = sanitizeIssueBoxes(parsed.issue_boxes, parsed.issues);
  parsed._templateMode = useTextMode ? 'text' : 'image';
  parsed._usage = response.usage || null;
  return parsed;
}

/**
 * Lọc bbox từ AI: bỏ out-of-range, quá nhỏ; cap 5; giữ chỉ box có label match issues.
 * AI thường trả bbox optimistic — better safe than misleading promotor.
 */
function sanitizeIssueBoxes(boxes, issues) {
  if (!Array.isArray(boxes)) return [];
  const issueSet = new Set((issues || []).map((s) => String(s).trim()));
  const valid = [];
  for (const b of boxes) {
    if (!b || typeof b !== 'object') continue;
    const { label, x, y, w, h } = b;
    if (typeof label !== 'string' || !issueSet.has(label.trim())) continue;
    if ([x, y, w, h].some((n) => typeof n !== 'number' || !Number.isFinite(n))) continue;
    if (x < 0 || x > 1 || y < 0 || y > 1 || w <= 0.02 || h <= 0.02) continue;
    if (x + w > 1.001 || y + h > 1.001) continue;  // Cho phép sai số nhỏ
    valid.push({ label: label.trim(), x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) });
    if (valid.length >= 5) break;
  }
  return valid;
}

/**
 * Kết hợp đánh giá ảnh cuối ngày + so target.
 * QUAN TRỌNG: phải nhận đầy đủ campaignRequirements thật (không hardcode generic text)
 * để AI đánh giá nhất quán giữa start/end submissions.
 * @returns {Promise<{evaluation:object, summary:string}>}
 */
export async function evaluateEndOfDayReport({
  endImagePath,
  templateImagePath,
  campaignName,
  campaignRequirements,    // ⭐ Phải truyền vào — đừng hardcode
  requirementsJson = null,
  templateDescription = null,  // v2: pass-through cho text mode
  reportedSubscribers,
  targetSubscribers,
}) {
  const evaluation = await evaluateSubmissionImage({
    submissionImagePath: endImagePath,
    templateImagePath,
    campaignName,
    campaignRequirements: campaignRequirements || '(Không có yêu cầu cụ thể)',
    requirementsJson,
    templateDescription,
  });

  const achieved = reportedSubscribers >= targetSubscribers;
  const percent = targetSubscribers
    ? (reportedSubscribers / targetSubscribers) * 100
    : 0;

  const pctFixed = percent.toFixed(0);
  let summary;
  if (achieved && evaluation.meets_standard) {
    summary = ES.END_OK(
      campaignName,
      reportedSubscribers,
      targetSubscribers,
      pctFixed,
      evaluation.similarity_score,
    );
  } else if (achieved && !evaluation.meets_standard) {
    const issues =
      (evaluation.issues || []).slice(0, 2).join('; ') || 'ver retroalimentación';
    summary = ES.END_SUBS_OK_IMG_NO(
      reportedSubscribers,
      targetSubscribers,
      evaluation.similarity_score,
      issues,
    );
  } else if (!achieved && evaluation.meets_standard) {
    summary = ES.END_IMG_OK_SUBS_NO(
      reportedSubscribers,
      targetSubscribers,
      pctFixed,
    );
  } else {
    summary = ES.END_NEITHER(
      campaignName,
      reportedSubscribers,
      targetSubscribers,
      pctFixed,
      evaluation.similarity_score,
    );
  }

  return { evaluation, summary };
}
