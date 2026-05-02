# Telecom Big — Campaign AI Monitoring Platform

Hệ thống AI tự động đánh giá ảnh hiện trường campaign do team leader bán hàng gửi qua WhatsApp group, so sánh với template chuẩn bằng **OpenAI GPT-4o vision**, và tổng hợp báo cáo cuối ngày tự động — dành cho **Telecom Big** (Peru).

**Production:** https://image.bitelbot.com (admin only)

## 📦 2 components

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  bot/  (Node.js)        │         │  crm/  (Next.js 16)     │
│  ├─ whatsapp-web.js     │ ←─DB─→  │  ├─ Server components   │
│  ├─ OpenAI vision       │ shared  │  ├─ Auth.js + RBAC      │
│  ├─ Telegram admin      │ SQLite  │  ├─ react-leaflet maps  │
│  │   commands           │         │  ├─ Recharts            │
│  └─ Cache + throttle    │         │  └─ ExcelJS export      │
└─────────────────────────┘         └─────────────────────────┘
         │                                    │
         └──────────── nginx ──────── HTTPS ──┘
                       │
                  systemd units
                  (auto-restart)
```

## 🆕 Production features (toàn bộ phases A→D đã deploy)

### Speed (Phase A)
- Submissions list với thumbnails, multi-select bulk actions (approve/reject/delete)
- 11 advanced filters (promotor, score range, date range, GPS area haversine, ...)
- Quick filter chips (Today / Needs review / Rejected / Score<50 / No GPS)
- Telegram admin: `/approve <id>`, `/reject <id> <reason>` từ chat
- Real-time polling 15s — banner báo submission mới

### Accuracy (Phase B)
- **Multi-image submission**: promotor gửi N ảnh trong 30s window → group thành 1 submission, gallery view
- **Image quality pre-check**: reject ảnh < 10KB / > 15MB / dimension < 400px TRƯỚC khi gọi AI (save cost)
- **Comments/notes** internal giữa admin/manager per submission
- **Audit timeline UI** per submission (override, comment, status changes)
- **AI confidence routing**: low confidence → auto needs_review queue

### Convenience (Phase C)
- Mobile-responsive submissions list (collapsible columns)
- **GPS heatmap** trên Reports với Leaflet circle markers (cluster grid 500m)
- **Promotor leaderboard** standalone với 🥇🥈🥉 medals + sortable
- **SLA tracking**: avg time submit → first review
- **Daily Telegram digest** mở rộng (top promotors, training alerts, AI cost saved)
- **Custom rejection reasons** predefined enum cho admin override

### Monitoring (Phase D)
- **Branch GPS HQ + radius** validation: submissions xa branch HQ → flag fuera-de-zona + needs_review
- **Auto-escalation cron** (mỗi 30 phút): submissions stuck > 2h → Telegram admin alert
- **Duplicate image alert**: cache hit > 24h → "♻️ Promotor reuse ảnh cũ"
- **Weekly training cron** (Mon 8AM Lima): promotors reject_rate ≥ 50% → notify manager
- **Cache rate alert**: hit rate < 20% → daily digest warning

### Performance optimizations
- **Vision result cache** (SHA-256 image hash + campaign + mode) → cache HIT 3ms vs API 4000ms (~1300x faster)
- **Submission throttle** configurable (default 5s) — anti accidental double-tap
- **Detection mode toggle** (Hướng 2): AI chỉ detect, code tính score deterministic
- **Model picker**: swap gpt-4o ↔ gpt-4o-mini ↔ custom qua UI
- **All 3 toggles + model picker** quản lý qua `/dashboard/config-ai`

### Telegram admin commands (7)
- `/status` — uptime, WhatsApp state, memory, **disk usage** với threshold 75%/90%, vision mode, today's stats
- `/restart` — graceful restart via systemd
- `/logs` — last 20 log lines (journalctl)
- `/qr` + `/qr confirm` — force re-auth, gửi QR code mới qua chat
- `/approve <id>` — quick override approved
- `/reject <id> <reason>` — quick override rejected
- `/help` — list commands

## Kiến trúc

```
                                    ┌──────────────────────┐
WhatsApp Group  ←─── Puppeteer ────▶│ whatsapp-web.js      │
(Sales Leaders)     (QR scan 1 lần) │  ├─ on("message")    │
                                    │  ├─ download media   │
                                    │  └─ reply (in group) │
                                    └──────────┬───────────┘
                                               ▼
                                    ┌──────────────────────┐
                                    │  Handler             │
                                    │  ├─ Parse caption    │
                                    │  ├─ Match campaign   │
                                    │  └─ Save submission  │
                                    └────┬───────────┬─────┘
                                         ▼           ▼
                              ┌─────────────┐  ┌──────────────┐
                              │ OpenAI      │  │ SQLite       │
                              │ gpt-4o      │  │ better-      │
                              │ (vision +   │  │ sqlite3      │
                              │  JSON mode) │  └──────────────┘
                              └─────────────┘

Express admin: GET/POST /admin/campaigns, /admin/submissions, /admin/daily-reports
```

## Tính năng

1. **Đầu ngày** — team leader gửi ảnh + caption `CAMPAIGN <mã>` vào group bot. AI so sánh với template chuẩn, trả lời ngay (Sí ✅ / cần sửa ⚠️) bằng tiếng Tây Ban Nha.
2. **Cuối ngày** — caption `END <mã> SUBS=<số>` → AI đánh giá ảnh + so target → tự sinh `Daily Report` trong DB.
3. **Lệnh chat**: `HELP` (hướng dẫn), `STATUS` (list campaign).
4. **Admin REST API** quản lý chi nhánh / team leader / campaign / xem báo cáo (auth bằng `x-api-key`).
5. **Idempotent** — không xử lý trùng nếu cùng `wa_message_id`.
6. **Lọc group** — chỉ xử lý các group có tên trong `ALLOWED_GROUP_NAMES`.

## Cài đặt

### 1. Yêu cầu hệ thống

- **Node.js ≥ 20**
- **macOS / Linux** (Windows cũng được nhưng cần Chromium từ Puppeteer)
- ~500 MB RAM cho Puppeteer/Chromium
- 1 số WhatsApp riêng cho bot (không dùng số cá nhân chính)

### 2. Cài

```bash
cd /Users/chilevan/Desktop/CTYAI
npm install
```

> Lần đầu npm install sẽ tải Chromium (~150MB) cho Puppeteer.

### 3. Cấu hình `.env`

```bash
cp .env.example .env
# Sửa .env, điền tối thiểu:
#   OPENAI_API_KEY      → https://platform.openai.com/api-keys
#   ADMIN_API_KEY       → tự đặt, dùng khi gọi /admin/*
#   ALLOWED_GROUP_NAMES → tên group team leader gửi ảnh (chính xác từng ký tự)
```

### 4. Tạo dữ liệu demo

```bash
npm run seed
```

### 5. Chạy bot

```bash
npm start
```

Lần đầu sẽ in **QR code ra terminal**:
1. Mở WhatsApp trên điện thoại → **Settings → Linked Devices → Link a Device**
2. Quét QR
3. Phiên lưu vào `data/wa-session/` → các lần sau tự đăng nhập

### 6. Add bot vào group

Sau khi bot online, thêm số WhatsApp của bot vào group có team leader. Nếu đã set `ALLOWED_GROUP_NAMES`, tên group phải khớp.

### 7. Test AI vision (không cần WhatsApp)

```bash
npm run test:vision -- ./data/templates/template.jpg ./test_photo.jpg "PROMO_LIMA_001"
```

## Tạo campaign mới (admin)

```bash
curl -X POST http://localhost:3000/admin/campaigns \
  -H "x-api-key: $ADMIN_API_KEY" \
  -F "code=PROMO_LIMA_001" \
  -F "name=Promoción Plan Postpago Marzo" \
  -F "description=Khuyến mãi gói trả sau" \
  -F "template_requirements=Banner đỏ rộng 2m, promotor mặc áo đỏ..." \
  -F "target_subscribers=20" \
  -F "branch_id=1" \
  -F "template_image=@/path/to/template.jpg"
```

Hoặc xem các endpoint khác tại http://localhost:3000

## Quy trình hằng ngày

### Team leader (qua WhatsApp)

**Đầu ngày** — chụp ảnh điểm bán, gửi vào group:
```
[ảnh]
CAMPAIGN PROMO_LIMA_001
```
→ Bot trả lời ngay (tag tên người gửi):
```
@Carlos ✅ Ảnh đầu ngày campaign Promoción Plan Postpago Marzo ĐẠT chuẩn (85/100).
¡La instalación se ve excelente! Mantengan el banner visible durante el día.
Mục tiêu hôm nay: 20 thuê bao. ¡Éxito!
```

**Cuối ngày** — chụp ảnh + caption:
```
[ảnh]
END PROMO_LIMA_001 SUBS=23
```
→ Bot trả lời:
```
@Carlos ✅ Campaign Promoción Plan Postpago Marzo ĐẠT mục tiêu hôm nay!
Thuê bao: 23/20 (115%) — Ảnh đạt chuẩn (88/100). ¡Buen trabajo!
```

### Quản lý xem báo cáo

```bash
# Submissions hôm nay
curl -H "x-api-key: $ADMIN_API_KEY" \
     "http://localhost:3000/admin/submissions?limit=20"

# Daily report 1 campaign
curl -H "x-api-key: $ADMIN_API_KEY" \
     "http://localhost:3000/admin/daily-reports?campaign_code=PROMO_LIMA_001"
```

## Cấu trúc project

```
CTYAI/
├── package.json
├── .env.example
├── index.js                # entry: WhatsApp + Express
├── src/
│   ├── config.js           # đọc .env
│   ├── logger.js           # pino
│   ├── db.js               # SQLite schema + helpers
│   ├── vision.js           # OpenAI gpt-4o vision (JSON mode)
│   ├── handler.js          # parse caption, đánh giá, lưu, format reply
│   ├── wa.js               # whatsapp-web.js client
│   ├── admin.js            # Express admin API
│   ├── seed.js             # tạo demo data
│   └── scripts/
│       └── test-vision.js  # test vision không cần WhatsApp
├── data/
│   ├── telecombig.db       # SQLite
│   ├── uploads/            # ảnh team leader gửi
│   ├── templates/          # ảnh template campaign
│   └── wa-session/         # phiên WhatsApp Web (LocalAuth)
└── _archive_python/        # phiên bản Python ban đầu (lưu trữ)
```

## Chi phí ước tính (OpenAI)

- Mỗi đánh giá ảnh: ~1.500 input tokens (gồm 2 ảnh 'high' detail) + ~500 output tokens.
- **gpt-4o**: $2.50/1M input + $10/1M output → **~$0.009 / ảnh**.
- 25 chi nhánh × 5 campaign × 2 ảnh/ngày = ~250 ảnh/ngày → **~$2.25/ngày** ≈ $68/tháng.
- Có thể dùng **gpt-4o-mini** ($0.15/1M input) → **~$0.001 / ảnh** = ~$8/tháng (giảm chi phí 10×, độ chính xác thấp hơn).
  Đổi bằng cách set `OPENAI_VISION_MODEL=gpt-4o-mini` trong `.env`.

## Cảnh báo về whatsapp-web.js

- Dùng Puppeteer để điều khiển WhatsApp Web → **không phải API chính thức của Meta**.
- WhatsApp **có thể ban** số nếu phát hiện hành vi spam. Với business use bình thường (vài chục tin/ngày, có người thật trong group) rủi ro thấp.
- **Không có SLA** — nếu Meta thay đổi WhatsApp Web, library cần update.
- Để hạn chế rủi ro: dùng số riêng cho bot (không dùng số cá nhân chính), không gửi tin nhắn quảng cáo, giới hạn rate.

## Roadmap

- [ ] Auto restart Puppeteer khi disconnect
- [ ] Dashboard web hiển thị live submissions + bản đồ GPS
- [ ] Export Excel/PDF báo cáo cho ban giám đốc
- [ ] Alert Slack/email khi nhiều campaign không đạt target
- [ ] Migrate sang PostgreSQL khi scale lớn
- [ ] Hỗ trợ nhận GPS qua Location message kèm theo

## Liên hệ

bitel.chi@gmail.com
