# گزارش ممیزی تخصصی: خط لوله ویدیو (Video Pipeline) - پروژه همایون

**تاریخ:** ۱۹ آبان ۱۴۰۳  
**محقق:** مهندس ارشد Full-Stack / متخصص ویدیو استریمینگ  
**محدوده:** از آپلود در Course Builder تا پخش در Classroom

---

## خلاصه اجرایی

| مؤلفه | وضعیت | نمره |
|----------|-------|------|
| **آپلود و ذخیره‌سازی (Upload & Storage)** | PARTIAL | 70/100 |
| **پردازش ویدیو (Transcoding/HLS)** | **FAIL** | 15/100 |
| **احراز دسترسی و توکن (Access & Token)** | PASS | 85/100 |
| **استریم و پخش (Streaming/Playback)** | PARTIAL | 60/100 |
| **یکپارچگی فرانت/بک (Frontend-Backend Sync)** | PARTIAL | 55/100 |

**مشکل اصلی شناسایی شده:** **Worker پردازش ویدیو هرگز صدا زده نمی‌شود** → ویدیوها به HLS تبدیل نمی‌شوند، Thumbnail تولید نمی‌شود، `processing.status` به صورت مصنوعی روی `READY` ست می‌شود.

---

## ۱. معماری واقعی سیستم ویدیو (مسیر داده)

```
Course Builder (Frontend)
    │
    ├── VideoUploadService.uploadVideo()
    │       ↓ FormData (file, lectureId, contentItemId, courseId, type, duration)
    │
    ├── POST /api/v1/upload/proxy (uploadController.proxyUpload)
    │       ↓ storageService.uploadBuffer() → S3 (ArvanCloud)
    │       ↓ Lecture/ContentItem آپدیت می‌شود:
    │           • storage.key = S3 key
    │           • videoUrl = S3 URL
    │           • processing.status = 'READY'  ← **مصنوعی!**
    │           • processing.hls.qualities = []  ← **خالی!**
    │           • processing.thumbnails = []     ← **خالی!**
    │       ↓ lecture.save()
    │
    ❌ **نقص بحرانی:** addVideoProcessingJob() **هرگز صدا زده نمی‌شود**
    │
    ▼
Video Processing Queue (BullMQ + Redis)
    │
    ❌ Job در صف قرار نمی‌گیرد
    │
    ▼
Video Processor Worker (videoProcessor.worker.ts)
    │
    ❌ Worker اجرا نمی‌شود
    │
    ▼
MongoDB (Lecture.contentItems[].processing)
    │
    ├── processing.status = 'READY' (مصنوعی)
    ├── processing.hls.masterPlaylist = undefined
    ├── processing.hls.qualities = []
    ├── processing.thumbnails = []
    │
    ▼
Course Detail / Classroom (Frontend)
    │
    ├── GET /api/v1/courses/:slug → sanitizeLectureMedia() → storage.key حذف می‌شود
    │
    ├── Classroom: CourseAccessService.startLesson()
    │       ↓ POST /courses/:courseId/access/lessons/:lectureId/start
    │       ↓ sequentialAccess + dailyQuota + entitlement
    │       ↓ PlaybackSessionService.createSession() → JWT token (15min)
    │       ↓ Returns: streamUrl = `/api/v1/upload/stream/:lectureId?t=<token>`
    │
    ├── VideoPlayerComponent: videoUrl = streamUrl
    │       ↓ GET /api/v1/upload/stream/:lectureId?t=<token>
    │       ↓ streamLectureVideo() → extractS3Key() → storageService.getVideoStream()
    │       ↓ Stream MP4 مستقیم از S3 (Range Request پشتیبانی شده)
    │
    └── ❌ HLS Master Playlist وجود ندارد → Adaptive Bitrate کار نمی‌کند
    └── ❌ Thumbnail وجود ندارد → Poster پیش‌فرض نمایش داده می‌شود
```

---

## ۲. تحلیل جزئی هر لایه

### ۲.۱ فرانت‌اند: Course Builder → آپلود

| فایل | متد | وضعیت | نکات |
|------|------|-------|------|
| `video-upload.service.ts` | `uploadVideo()` | PASS | Chunked upload، multipart support، progress tracking، `contentItemId` ارسال می‌کند |
| `course-builder.component.ts` | `onContentItemVideoSelected()` | PASS | `ensureContentItemSaved()` → backend contentItem ایجاد می‌کند، سپس آپلود |
| `course-builder.component.ts` | `ensureContentItemSaved()` | PARTIAL | Placeholder contentItem برای video بدون `videoUrl`/`storage` ایجاد می‌کند → backend validation error محتمل |

**نکته مهم:** `uploadVideo()` پارامتر `contentItemId` را در FormData ارسال می‌کند (خط ۳۸۰).

---

### ۲.۲ بک‌اند: Upload Controller → ذخیره و آپدیت

**فایل:** `backend/src/controllers/uploadController.ts`

| متد | خطوط | وضعیت | تحلیل |
|------|------|-------|--------|
| `proxyUpload()` | ۱۵۰-۳۵۰ | **PARTIAL** | ✅ آپلود به S3، ✅ آپدیت Lecture/ContentItem، ✅ `storage.key` ست می‌کند، ❌ **`addVideoProcessingJob()` صدا زده نمی‌شود**، ❌ `processing.status = 'READY'` مصنوعی ست می‌کند |
| `buildCompletedProcessing()` | ۹۰-۱۰۰ | **FAIL** | Объект `processing` جدید می‌سازد با `status: 'READY'` اما `hls.qualities = []` و `thumbnails = []` — پردازش واقعی انجام نشده |
| `streamLectureVideo()` | ۳۵۰-۵۵۰ | PASS | استریم مستقیم MP4 از S3 با Range Request، JWT token validation، Security headers |

**کد مخرب (خط ۲۸۰-۲۹۰):**
```typescript
// در proxyUpload - آپدیت ContentItem
(contentItem as any).processing = buildCompletedProcessing((contentItem as any).processing);

// buildCompletedProcessing:
const buildCompletedProcessing = (existing: any): any => {
  return {
    status: 'READY',           // ← مصنوعی
    progress: 100,
    hls: existing?.hls || { qualities: [] },  // ← خالی
    thumbnails: existing?.thumbnails || [],   // ← خالی
  };
};
```

**تابع `addVideoProcessingJob` وجود دارد اما فراخوانی نمی‌شود:**
```typescript
// backend/src/queues/videoProcessor.queue.ts خط ۴۰-۵۵
export const addVideoProcessingJob = async (
  lectureId: string,
  storageKey: string,
  bucket: string,
): Promise<string> => {
  const job = await videoProcessingQueue.add('transcode-hls', { lectureId, storageKey, bucket });
  return job.id!;
};
```

---

### ۲.۳ صف و Worker پردازش ویدیو

**فایل‌ها:**
- `backend/src/queues/videoProcessor.queue.ts` - BullMQ Queue
- `backend/src/workers/videoProcessor.worker.ts` - FFmpeg Worker

| مؤلفه | وضعیت | توضیح |
|----------|-------|-------|
| **Queue Configuration** | PASS | BullMQ با Redis، retry exponential backoff، concurrency 2 |
| **Worker Logic** | PASS | FFmpeg spawn امن، HLS 3 کیفیت (1080p/720p/480p)، Thumbnail ۳ نقطه، Stream upload به S3 |
| **Job Trigger** | **FAIL** | **هیچ‌کجا در کد `addVideoProcessingJob()` صدا زده نمی‌شود** |
| **Idempotency** | PASS | چک می‌کند `processing.status === 'READY'` باشد job skip شود |
| **Error Handling** | PASS | Status `FAILED` با error message، cleanup temp dir |

**Worker Flow (اگر اجرا شود):**
1. دانلود MP4 از S3 (stream-based، memory-safe)
2. FFmpeg transcode به HLS ۳ کیفیت
3. آپلود segments + master.m3u8 به S3
4. تولید ۳ Thumbnail در ۲۵٪، ۵۰٪، ۷۵٪
5. آپدیت MongoDB: `processing.status = 'READY'`، `hls.masterPlaylist`، `hls.qualities`، `thumbnails`، `duration`

---

### ۲.۴ کنترل دسترسی و توکن پخش

**فایل‌ها:**
- `backend/src/controllers/courseAccessController.ts` - `startLesson()`
- `backend/src/services/playbackSession.service.ts`
- `backend/src/utils/courseAccess.ts`

| مؤلفه | وضعیت | توضیح |
|----------|-------|-------|
| **Entitlement Check** | PASS | `EntitlementService.checkEntitlement()` - رایگان/پولی/مدرس/ادمین |
| **Sequential Access** | PASS | `SequentialAccessService.checkLessonAccess()` - پیش‌نیاز درس قبلی |
| **Daily Quota** | PASS | `DailyQuotaService.startLesson()` - سهمیه روزانه |
| **Playback Session** | PASS | JWT token ۱۵ دقیقه، IP/User-Agent binding، Redis storage |
| **Token Validation** | PASS | `tryAuthFromStreamToken()` در `streamLectureVideo()` |

**Flow در `startLesson()`:**
```typescript
// courseAccessController.ts خط ۲۰۰-۲۸۰
1. Entitlement check → hasAccess
2. Sequential access check → isAccessible, lockReason
3. Daily quota check → quotaResult
4. PlaybackSessionService.createSession() → { streamUrl, token, expiresIn }
5. Return: { streamUrl, token, expiresIn, remainingDailyQuota, ... }
```

---

### ۲.۵ استریم ویدیو (Playback)

**فایل:** `backend/src/controllers/uploadController.ts` - `streamLectureVideo()`

| مؤلفه | وضعیت | توضیح |
|----------|-------|-------|
| **S3 Key Resolution** | PASS | `extractS3Key()` از `contentItem.storage.key` یا `videoUrl` یا `lecture.storage.key` |
| **ContentItem Priority** | PASS | اول `contentItem[resourceId]`، بعد `contentItem[first-video]`، بعد `lecture`، آخر `promoVideo` |
| **Range Request Support** | PASS | HTTP 206 Partial Content، `Accept-Ranges: bytes` |
| **Security Headers** | PASS | CSP، X-Content-Type-Options، Cache-Control: no-store |
| **HEAD Request** | PASS | برای preload metadata |
| **Fallback Logic** | PARTIAL | اگر `resourceId` داده شده اما پیدا نشود، به first-video fallback می‌کند |

**فایل:** `frontend/src/app/shared/components/video-player/video-player.component.ts`

| مؤلفه | وضعیت | توضیح |
|----------|-------|-------|
| **Token Handling** | PASS | `playbackToken` prop، heartbeat هر ۱۰ ثانیه با token |
| **URL Expiry Detection** | PASS | `checkIfUrlExpired()` - 401/403/410 → `urlExpired` emit |
| **Auto Retry** | PASS | Max 2 retry با exponential backoff |
| **Heartbeat** | PASS | `token`, `currentPosition`, `watchedDuration`, `duration` |

---

### ۲.۶ Classroom: منطق قفل ویدیو

**فایل:** `frontend/src/app/features/learning/classroom/classroom.component.ts`

| Computed | خطوط | وضعیت | تحلیل |
|----------|------|-------|--------|
| `lectureLockReason()` | ۲۰۰-۲۸۰ | **PARTIAL** | منطق پیچیده: چک می‌کند `contentItem.processing?.status` و `lecture.processing?.status` |
| `isLectureLocked()` | ۲۸۲ | PARTICIAL | بر اساس `lectureLockReason() !== 'none'` |

**الگوریتم `lectureLockReason()`:**
```typescript
1. پیدا کردن videoContentItem: lecture.contentItems.find(type==='video' && (storage.key || videoUrl))
2. effectiveStatus = videoContentItem.processing?.status || lecture.processing?.status
3. hasVideoFile = !!(storage.key || videoUrl)
4. اگر effectiveStatus === 'READY' → 'none' (باز)
5. اگر effectiveStatus === 'FAILED' → 'processing' (قفل)
6. اگر effectiveStatus ∈ {PENDING,UPLOADING,PROCESSING} && !hasVideoFile → 'processing' (قفل)
7. در غیر این صورت → 'none' (باز)
```

**مشکل:** چون `proxyUpload` بلافاصله `processing.status = 'READY'` ست می‌کند (بدون پردازش واقعی)، شرط ۴ برقرار می‌شود و ویدیو **باز** نمایش داده می‌شود. اما:
- HLS qualities خالی است → Adaptive bitrate کار نمی‌کند
- Thumbnail خالی است → Poster پیش‌فرض
- اگر کاربر seek کند، MP4 کامل دانلود می‌شود (بدون HLS segments)

---

## ۳. باگ‌های بحرانی شناسایی شده

| کد | مؤلفه | شدت | توضیح | فایل/خط |
|-----|--------|------|---------|----------|
| **VP-01** | Video Processing | 🔴 **Critical** | **Worker هرگز trigger نمی‌شود** - `addVideoProcessingJob()` در `proxyUpload` صدا زده نمی‌شود | `uploadController.ts:280` |
| **VP-02** | Processing Status | 🔴 **Critical** | `processing.status = 'READY'` به صورت مصنوعی ست می‌شود بدون پردازش واقعی | `uploadController.ts:90-100` |
| **VP-03** | HLS Generation | 🔴 **Critical** | Master playlist و qualities هرگز تولید نمی‌شوند → Adaptive bitrate غیرفعال | `videoProcessor.worker.ts` (not triggered) |
| **VP-04** | Thumbnail Generation | 🟠 **High** | Thumbnailها تولید نمی‌شوند → Poster پیش‌فرض در پلیر | `videoProcessor.worker.ts` (not triggered) |
| **VP-05** | Duration Extraction | 🟠 **High** | `duration` از FFmpeg استخراج نمی‌شود → `lecture.duration` = 0 | `videoProcessor.worker.ts` (not triggered) |
| **VP-06** | ContentItem Placeholder | 🟠 **High** | `ensureContentItemSaved()` برای video placeholder payload خالی می‌فرستد | `course-builder.component.ts:2450` |
| **VP-07** | Sanitization Leak | 🟡 **Medium** | `sanitizeContentItem()` `storage.key` حذف می‌کند اما `processing.hls.masterPlaylist` ممکن است raw URL باشد | `mediaGuard.ts:120` |
| **VP-08** | Race Condition | 🟡 **Medium** | Classroom ممکن است قبل از `lecture.save()` داده بخواند → stale `processing.status` | `classroom.component.ts:420` |

---

## ۴. ناهماهنگی‌های داده (Data Flow Mismatches)

| # | فیلد | Course Builder | Backend Storage | Course Detail API | Classroom | وضعیت |
|---|------|----------------|-----------------|-------------------|-----------|-------|
| 1 | `processing.status` | نمایش نمی‌دهد | `'READY'` (مصنوعی) | `'READY'` | چک می‌کند | ❌ Fake |
| 2 | `processing.hls.qualities` | نمایش نمی‌دهد | `[]` | `[]` | استفاده نمی‌کند | ❌ Empty |
| 3 | `processing.hls.masterPlaylist` | نمایش نمی‌دهد | `undefined` | حذف شده (sanitize) | استفاده نمی‌کند | ❌ Missing |
| 4 | `processing.thumbnails` | نمایش نمی‌دهد | `[]` | `[]` | استفاده نمی‌کند | ❌ Empty |
| 5 | `storage.key` | برای آپلود استفاده | S3 Key | **حذف شده** (sanitize) | برای stream استفاده | ⚠️ Sanitized |
| 6 | `videoUrl` | برای پیش‌نمایش | S3 Full URL | **حذف شده** (sanitize) | استفاده نمی‌کند | ⚠️ Sanitized |
| 7 | `duration` | محاسبه می‌کند (ثانیه) | ثانیه (از FFmpeg) | دقیقه (legacy) | دقیقه | ⚠️ Unit Mismatch |

---

## ۵. ریشه‌یابی مشکل اصلی: «این ویدیو در حال آماده‌سازی است»

**پیام در Classroom:** `lockTitle()` → `lectureLockReason() === 'processing'`

**شرطهای برگشت 'processing':**
1. `effectiveStatus === 'FAILED'` **OR**
2. `effectiveStatus ∈ {PENDING, UPLOADING, PROCESSING} && !hasVideoFile`

**چرا اتفاق می‌افتد؟**

سناریو ۱ (محتمل): **Race Condition**
- کاربر در Course Builder آپلود می‌کند
- `proxyUpload` شروع می‌کند، `processing.status` هنوز `'PENDING'` (پیش‌فرض) است
- کاربر بلافاصله به Classroom می‌رود
- `GET /courses/:slug` داده برمی‌گرداند با `processing.status = 'PENDING'`
- `hasVideoFile = true` (چون `storage.key` ست شده)
- اما شرط ۲: `effectiveStatus === 'PENDING' && !hasVideoFile` → `false` چون `hasVideoFile = true`
- شرط ۱ هم `false` است
- **نتیجه:** `return 'none'` → ویدیو باید باز باشد

سناریو ۲ (مشاهدات واقعی): **ContentItem پیدا نمی‌شود**
- `lecture.contentItems.find(type==='video' && (storage.key || videoUrl))` → `undefined`
- Fallback به `lecture.processing?.status` که پیش‌فرض `'PENDING'` است
- `lecture.storage?.key` هم ست نشده (چون آپلود روی ContentItem بوده)
- `hasVideoFile = false`
- شرط ۲: `'PENDING' && !false` → `'PENDING' && true` → **`return 'processing'`** ✅

**ریشه‌یابی:** آپلود روی **ContentItem** انجام می‌شود (`contentItemId` ارسال می‌شود)، اما `lecture.storage.key` ست **نمی‌شود** (فقط در legacy path). در `lectureLockReason`، اگر `videoContentItem` پیدا نشود، به `lecture.processing` fallback می‌کند که `'PENDING'` است.

**کد مربوطه در `proxyUpload` (خط ۲۲۰-۲۳۰):**
```typescript
if (contentItemId && lecture.contentItems && lecture.contentItems.length > 0) {
  // آپدیت ContentItem - این مسیر اجرا می‌شود
  // lecture.storage و lecture.processing آپدیت نمی‌شوند!
} else if (!contentItemId || type === 'video') {
  // Legacy path - فقط اگر contentItemId نداشته باشد
  lecture.storage = { ... };
  lecture.processing = buildCompletedProcessing(...);
}
```

---

## ۶. اولویت‌بندی رفع باگ

### اولویت ۱ (Critical - بلافاصله)
1. **VP-01:** Trigger Video Processing Worker در `proxyUpload` بعد از آپلود موفق
2. **VP-02:** حذف `buildCompletedProcessing` مصنوعی - status واقعی از Worker بیاید
3. **VP-08:** Fix `lectureLockReason` fallback logic - چک کند `contentItem` اول

### اولویت ۲ (High - این اسپرینت)
4. **VP-03:** تست کامل HLS Generation با Worker
5. **VP-04:** Thumbnail Generation در Worker
6. **VP-05:** Duration Extraction در Worker
7. **VP-06:** Fix `ensureContentItemSaved` برای video placeholder

### اولویت ۳ (Medium)
8. **VP-07:** Sanitization review - `processing.hls.masterPlaylist` raw URL leak
9. Unit consistency: Duration در ثانیه در همه جا
10. Integration tests برای Video Pipeline

---

## ۷. کد پیشنهادی برای رفع VP-01 (Trigger Worker)

**فایل:** `backend/src/controllers/uploadController.ts` در `proxyUpload()` بعد از `lecture.save()`:

```typescript
// بعد از await lecture.save() در proxyUpload
if (lectureId && (type === 'video' || type === 'lecture-video')) {
  // تعیین storageKey برای Worker
  let workerStorageKey = '';
  if (contentItemId) {
    const contentItem = lecture.contentItems?.find(
      (item: any) => item._id?.toString() === contentItemId
    );
    workerStorageKey = contentItem?.storage?.key || '';
  } else {
    workerStorageKey = lecture.storage?.key || '';
  }

  if (workerStorageKey) {
    try {
      const { addVideoProcessingJob } = await import('../queues/videoProcessor.queue');
      await addVideoProcessingJob(lectureId, workerStorageKey, bucket);
      console.log(`📥 [proxyUpload] Video processing job queued for lecture ${lectureId}`);
    } catch (err) {
      console.warn('⚠️ [proxyUpload] Failed to queue video processing job:', err?.message);
      // Fail-open: ویدیو آپلود شده، پردازش بعداً retry می‌شود
    }
  }
}
```

**و در `videoProcessor.worker.ts` خط ۳۰۰-۳۱۰، حذف چک `status === 'READY'` برای اجازه دادن reprocess:**
```typescript
// خط ۳۰۵: این چک باعث می‌شود اگر status مصنوعی READY باشد، worker skip کند
if (lecture.processing?.status === 'READY') {
  console.log(`⏭️ [Worker] درس ${lectureId} قبلاً پردازش شده — رد شد`);
  return { success: true, lectureId, skipped: true };
}
// باید تغییر کند به:
if (lecture.processing?.status === 'READY' && lecture.processing?.hls?.qualities?.length > 0) {
  // فقط اگر واقعاً پردازش شده (HLS qualities وجود دارد)
  return { success: true, lectureId, skipped: true };
}
```

---

## ۸. تست‌های پیشنهادی (End-to-End)

| سناریو | مراحل | انتظار |
|----------|--------|---------|
| **E2E-V01** | Course Builder: ایجاد درس → آپلود ویدیو ۱۰۰MB → ذخیره → Classroom: باز کردن درس | ویدیو پخش شود، HLS qualities در Network tab دیده شود، Thumbnail نمایش داده شود |
| **E2E-V02** | آپلود ویدیو → قطع اینترنت در ۵۰٪ → Refresh Classroom | Resume upload کار کند، پردازش بعد از آپلود کامل شود |
| **E2E-V03** | ویدیو ۵GB (Multipart) → آپلود → پردازش | Multipart upload کامل شود، Worker HLS تولید کند |
| **E2E-V04** | Classroom: Seek به وسط ویدیو → Pause → Play | Range Request 206، HLS segment loading، Heartbeat ارسال شود |
| **E2E-V05** | Token Expiry (۱۵ دقیقه) → ادامه تماشا | `urlExpired` emit → `refreshPlaybackUrl` → ادامه بی‌وقفه |
| **E2E-V06** | Sequential Access: درس ۲ قفل → درس ۱ کامل → درس ۲ باز شود | `startLesson` برای درس ۲ `isAccessible: true` برگرداند |

---

## ۹. فایل‌های کلیدی برای مراجعه

### Frontend
- `frontend/src/app/core/services/video-upload.service.ts` - آپلود سرویس
- `frontend/src/app/features/instructor/course-builder/course-builder.component.ts` - Course Builder (خط ۲۴۵۰ `ensureContentItemSaved`)
- `frontend/src/app/features/learning/classroom/classroom.component.ts` - Classroom (خط ۲۰۰ `lectureLockReason`)
- `frontend/src/app/shared/components/video-player/video-player.component.ts` - Video Player
- `frontend/src/app/core/services/course-access.service.ts` - Course Access Service

### Backend
- `backend/src/controllers/uploadController.ts` - Upload Controller (خط ۱۵۰ `proxyUpload`, خط ۳۵۰ `streamLectureVideo`)
- `backend/src/queues/videoProcessor.queue.ts` - Video Queue (خط ۴۰ `addVideoProcessingJob`)
- `backend/src/workers/videoProcessor.worker.ts` - Video Worker (FFmpeg HLS)
- `backend/src/controllers/courseAccessController.ts` - Access Controller (خط ۲۰۰ `startLesson`)
- `backend/src/services/playbackSession.service.ts` - Playback Session (JWT Token)
- `backend/src/utils/mediaGuard.ts` - Sanitization (خط ۱۲۰ `sanitizeContentItem`)
- `backend/src/models/Lecture.ts` - Lecture Model (ContentItem Schema)

---

## ۱۰. نتیجه‌گیری

**مشکل ریشه:** **Video Processing Pipeline قطع است.** ویدیوها به S3 آپلود می‌شوند اما **هرگز به HLS تبدیل نمی‌شوند** چون Worker trigger نمی‌شود. `processing.status` به صورت مصنوعی روی `READY` ست می‌شود که باعث می‌شود:
1. Classroom گاهی "در حال آماده‌سازی" نشان دهد (fallback logic bug)
2. Adaptive Bitrate (HLS) کار نکند
3. Thumbnail تولید نشود
4. Duration استخراج نشود

**راه‌حل:** اضافه کردن `addVideoProcessingJob()` در `proxyUpload` و اصلاح Worker idempotency check.

---

**پایان گزارش**