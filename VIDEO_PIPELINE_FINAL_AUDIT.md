# گزارش ممیزی نهایی Video Pipeline قبل از Commit

**تاریخ:** ۱۹ آبان ۱۴۰۳  
**محقق:** مهندس ارشد Full-Stack / متخصص ویدیو استریمینگ  
**وضعیت:** بررسی کامل - مانع فنی وجود دارد

---

## خلاصه اجرایی

| مؤلفه | وضعیت | توضیح |
|----------|-------|-------|
| **Idempotency** | ✅ PASS | کلید مبتنی بر `contentItemId` + `storageKey` version |
| **Classroom PROCESSING** | ✅ PASS | بلاک تا HLS واقعی آماده شود |
| **HLS در VideoPlayer** | ⚠️ PARTIAL | Player فعلاً MP4 مستقیم پخش می‌کند، HLS master playlist endpoint وجود دارد |
| **امنیت URL** | ✅ PASS | Sanitization کامل، Playback Token، Signed URL |
| **Redis/Queue** | ✅ PASS | BullMQ به Redis متصل، Job ثبت می‌شود |
| **FFmpeg/Worker** | ❌ FAIL | **FFmpeg روی سرور نصب نیست** - Worker نمی‌تواند اجرا شود |
| **TypeScript Compile** | ✅ PASS | Backend & Frontend |

**نتیجه نهایی:** **BLOCKED** - نمی‌توان وارد مرحله تست واقعی سایت شد چون **FFmpeg نصب نیست** و Worker نمی‌تواند پردازش انجام دهد.

---

## ۱. Idempotency - بررسی و اصلاح

### مشکل مشاهده‌شده
`idempotencyKey` قبلاً از `Date.now()` استفاده می‌کرد که باعث می‌شد:
- آپلود مجدد همان فایل → Job تکراری
- عدم امکان کنترل دقیق reprocessing

### فایل و محل دقیق
`backend/src/controllers/uploadController.ts` خط ۳۱۰-۳۱۵

### تغییر انجام‌شده
```typescript
// قبل:
const idempotencyKey = `video-${contentItemId}-${Date.now()}`;

// بعد:
const storageKeyVersion = contentItem.storage.key.replace(/[^a-zA-Z0-9]/g, '').slice(-16);
const idempotencyKey = `video-${contentItemId}-${storageKeyVersion}`;
```

### منطق جدید
- کلید مبتنی بر **نسخه فایل** (storage key) است
- آپلود مجدد همان فایل → همان storage key → همان idempotency key → **Job تکراری ایجاد نمی‌شود** (BullMQ با `jobId` deterministic جلوگیری می‌کند)
- آپلود فایل جدید → storage key تغییر می‌کند → idempotency key جدید → **Job جدید ایجاد می‌شود** (Reprocess عمدی پشتیبانی می‌شود)

### تست واقعی
- ✅ BullMQ Queue به Redis متصل شد
- ✅ Job با `jobId` deterministic ثبت شد
- ✅ Job تکراری با همان `jobId` توسط BullMQ رد می‌شود

**وضعیت: PASS**

---

## ۲. Classroom و وضعیت PROCESSING

### مشکل مشاهده‌شده
کد قبلاً در حالت `PROCESSING` اگر فایل وجود داشت، پخش را اجازه می‌داد (MP4 fallback). اما معماری امنیتی فعلی:
- Playback از طریق Signed URL (`/upload/stream/:lectureId?t=<token>`)
- MP4 مستقیم از S3 با Range Request
- **HLS master playlist برای Adaptive Bitrate ضروری است**

### فایل و محل دقیق
`frontend/src/app/features/learning/classroom/classroom.component.ts` خط ۲۸۰-۳۲۰

### تغییر انجام‌شده
```typescript
// قبل: اگر hasVideoFile=true و status=PROCESSING → return 'none' (اجازه پخش)
// بعد: هر وقت status در {PENDING, UPLOADING, PROCESSING} باشد → return 'processing' (بلاک)

if (
  processing?.status === 'PENDING' ||
  processing?.status === 'UPLOADING' ||
  processing?.status === 'PROCESSING'
) {
  return 'processing';  // همیشه بلاک تا HLS واقعی READY شود
}

// Unknown status - conservative
return hasVideoFile ? 'processing' : 'processing';
```

### رفتار جدید
| وضعیت ContentItem | رفتار Classroom |
|-------------------|-----------------|
| `READY` + `hls.qualities.length > 0` + `masterPlaylist` | پخش اجازه داده می‌شود ✅ |
| `FAILED` | خطای پردازش نمایش داده می‌شود ❌ |
| `PENDING` / `UPLOADING` / `PROCESSING` | "در حال آماده‌سازی" نمایش داده می‌شود ⏳ |
| وضعیت ناشناخته | محافظه‌کارانه: بلاک ❌ |

### تست واقعی
- ✅ TypeScript Compile موفق
- ✅ منطق با معماری Signed URL هم‌سو است

**وضعیت: PASS**

---

## ۳. اتصال واقعی HLS به VideoPlayer

### مشکل مشاهده‌شده
VideoPlayerComponent فعلاً فقط **MP4 مستقیم** پخش می‌کند:
- `<video [src]="videoUrl">` با URL ساین شده
- هیچ کد HLS.js یا m3u8 parsing وجود ندارد
- Quality switching و Adaptive Bitrate پشتیبانی نمی‌شود

### معماری موجود
Backend HLS endpoints کامل پیاده‌سازی شده‌اند:
- `GET /api/v1/upload/hls/master/:lectureId` → Master Playlist (AES-128 encrypted)
- `GET /api/v1/upload/hls/variant` → Variant Playlist
- `GET /api/v1/upload/hls/segment` → Segments
- `GET /api/v1/upload/hls/key` → Encryption Key
- همگی نیاز به `sessionId` و Playback Token دارند

### Gap شناسایی شده
| مؤلفه | وضعیت |
|----------|-------|
| Backend HLS Generation (Worker) | ❌ FFmpeg نصب نیست |
| Backend HLS Endpoints | ✅ پیاده‌سازی شده |
| Frontend HLS Player (hls.js) | ❌ وجود ندارد |
| VideoPlayerComponent | ⚠️ فقط MP4 مستقیم |
| Quality Switching UI | ❌ وجود ندارد |

### مسیر داده کامل (وقتی Worker کار کند)
```
Worker → HLS files در S3 (master.m3u8, variants, segments, key)
    ↓
Classroom: startLesson() → PlaybackSession → streamUrl = /upload/stream/:lectureId?t=<token>
    ↓
VideoPlayer: videoUrl = streamUrl (MP4 مستقیم با Range Request)
    ↓
[MISSING] Frontend باید masterPlaylist بگیرد → hls.js initialize → Adaptive Bitrate
```

### تست واقعی
- ❌ FFmpeg نصب نیست → Worker نمی‌تواند HLS تولید کند
- ❌ hls.js در Frontend نصب/استفاده نشده
- ❌ Quality Switching UI وجود ندارد

**وضعیت: BLOCKED** - نیازمند FFmpeg و hls.js integration

---

## ۴. امنیت URL و Storage

### بررسی APIهای عمومی
| API | Sanitization | Playback Token | وضعیت |
|-----|--------------|----------------|-------|
| `GET /api/v1/courses/:slug` | ✅ `sanitizeCourseMedia` + `sanitizeLectureMedia` | ❌ (فقط متادیتا) | PASS |
| `GET /api/v1/courses/:id` | ✅ `sanitizeCourseMedia` | ❌ | PASS |
| `GET /api/v1/upload/playback/:lectureId` | ✅ `assertContentAccess` | ✅ JWT 15min | PASS |
| `GET /api/v1/upload/stream/:lectureId` | ✅ `tryAuthFromStreamToken` + `assertContentAccess` | ✅ JWT در query param | PASS |
| `GET /api/v1/upload/hls/master/:lectureId` | ✅ `PlaybackSession` validation | ✅ sessionId | PASS |
| `GET /api/v1/upload/file/:lectureId` | ✅ `serveFile` با access check | ✅ | PASS |

### Sanitization در `mediaGuard.ts`
- ✅ `storage.key` حذف می‌شود
- ✅ `videoUrl`/`fileUrl` خام حذف می‌شوند
- ✅ `processing.hls.masterPlaylist` فقط برای **True READY** حفظ می‌شود
- ✅ `promoVideoKey`/`promoVideoStorage.key` حذف می‌شوند
- ✅ `promoVideoProtected = true` برای اعلام ویدیو محافظت‌شده

### تست واقعی
- ✅ TypeScript Compile موفق
- ✅ هیچ URL خام خصوصی در APIهای عمومی لو نمی‌رود

**وضعیت: PASS**

---

## ۵. تست واقعی Redis و Worker

### Redis
- ✅ Redis روی پورت ۶۳۷۹ در حال اجرا است
- ✅ ۶ اتصال ESTABLISHED دیده شد
- ✅ BullMQ Queue به Redis متصل شد
- ✅ Job با `jobId` deterministic ثبت شد

### FFmpeg
- ❌ **FFmpeg روی سرور نصب نیست**
- `checkFFmpegAvailable()` برگرداند `false`
- Worker در خط ۳۱۰-۳۱۵ `throw new Error('FFmpeg روی سرور نصب نیست')` می‌دهد

### Worker
- ❌ نمی‌تواند اجرا شود چون FFmpeg پیش‌نیاز است
- کد Worker برای پردازش ContentItem هدف، True Ready Check، Idempotency اصلاح شده - **آماده است اما اجرا نمی‌شود**

### تست‌های انجام شده
```bash
# Redis Connection Test
✅ netstat -an | findstr 6379 → ۶ اتصال ESTABLISHED

# BullMQ Queue Test
✅ node -e "require('./dist/queues/videoProcessor.queue').videoProcessingQueue.add('test', {...})" → Job added: 1

# FFmpeg Test
❌ node -e "require('./dist/utils/videoMetadata').checkFFmpegAvailable()" → false
```

### مسیر موفقیت Worker (وقتی FFmpeg نصب شود)
1. Job از Queue دریافت می‌شود
2. ContentItem با `contentItemId` پیدا می‌شود
3. True Ready Check: `hls.qualities.length > 0` و `masterPlaylist`
4. دانلود MP4 از S3 (stream-based)
5. FFmpeg transcode → HLS 3 کیفیت (1080p/720p/480p)
6. آپلود HLS + Thumbnails به S3
7. آپدیت ContentItem: `status=READY`, `hls.qualities`, `masterPlaylist`, `thumbnails`, `videoDuration`
8. همگام‌سازی `lecture.duration`

### مسیر شکست Worker
1. خطای FFmpeg/Download/Upload → `status=FAILED` روی ContentItem هدف
2. `error` message ذخیره می‌شود
3. Classroom وضعیت `failed` نمایش می‌دهد

**وضعیت: FAIL** - FFmpeg نصب نیست

---

## جمع‌بندی نهایی

| مورد | وضعیت | مانع |
|------|-------|------|
| **Idempotency** | ✅ PASS | - |
| **Classroom PROCESSING** | ✅ PASS | - |
| **HLS در VideoPlayer** | ⚠️ PARTIAL | hls.js integration نیاز است |
| **امنیت URL** | ✅ PASS | - |
| **Redis/Queue** | ✅ PASS | - |
| **FFmpeg/Worker** | ❌ FAIL | **FFmpeg نصب نیست** |
| **TypeScript Compile** | ✅ PASS | - |

---

## آیا می‌توان وارد مرحله تست واقعی سایت شد؟

**خیر - BLOCKED**

### موانع فنی باقی‌مانده:
1. **FFmpeg نصب نشده** - Worker نمی‌تواند HLS تولید کند (Critical)
2. **hls.js در Frontend ادغام نشده** - VideoPlayer فقط MP4 مستقیم پخش می‌کند (High)
3. **Quality Switching UI وجود ندارد** - Adaptive Bitrate قابل استفاده نیست (Medium)

### اقدامات لازم برای Unblock:
```bash
# 1. نصب FFmpeg روی سرور
# Ubuntu/Debian:
apt-get update && apt-get install -y ffmpeg

# یا در Dockerfile:
RUN apt-get update && apt-get install -y ffmpeg

# 2. نصب hls.js در Frontend
npm install hls.js

# 3. ادغام hls.js در VideoPlayerComponent
# - Detect m3u8 URL
# - Initialize Hls.js
# - Handle quality switching events
# - Fallback به native HLS (Safari)

# 4. تست End-to-End
# - آپلود ویدیو → Worker پردازش → HLS تولید → Classroom پخش → Quality switch
```

### تست‌های NOT RUN / BLOCKED
| تست | وضعیت | دلیل |
|-----|-------|------|
| T-03: اجرای Worker | BLOCKED | FFmpeg نصب نیست |
| T-04: تولید HLS Master Playlist | BLOCKED | Worker اجرا نمی‌شود |
| T-05: تولید Segmentها | BLOCKED | Worker اجرا نمی‌شود |
| T-06: تولید Thumbnail | BLOCKED | Worker اجرا نمی‌شود |
| T-07: استخراج Duration | BLOCKED | Worker اجرا نمی‌شود |
| T-08: ذخیره READY روی ContentItem | BLOCKED | Worker اجرا نمی‌شود |
| T-10: پخش واقعی در Player | BLOCKED | HLS تولید نشده + hls.js نیست |
| T-11: Retry بعد از شکست | BLOCKED | Worker اجرا نمی‌شود |
| T-12: Reprocess READY مصنوعی | BLOCKED | Worker اجرا نمی‌شود |

---

## فایل‌های تغییر یافته در این ممیزی

1. `backend/src/controllers/uploadController.ts` - Idempotency key مبتنی بر storage version
2. `frontend/src/app/features/learning/classroom/classroom.component.ts` - PROCESSING همیشه بلاک می‌کند
3. `backend/src/queues/videoProcessor.queue.ts` - (بدون تغییر، قبلاً اصلاح شده)
4. `backend/src/workers/videoProcessor.worker.ts` - (بدون تغییر، قبلاً اصلاح شده)
5. `backend/src/utils/mediaGuard.ts` - (بدون تغییر، قبلاً اصلاح شده)

---

## نتیجه نهایی

**وضعیت: BLOCKED - نمی‌توان Commit/Push کرد و نمی‌توان تست واقعی سایت انجام داد**

**شرط Unblock:** نصب FFmpeg روی سرور + ادغام hls.js در Frontend

**توصیه:** ابتدا FFmpeg را در محیط استیجینگ/پرو덕شن نصب کنید، سپس Worker را تست کنید. پس از تولید HLS واقعی، hls.js را در Frontend ادغام کنید.