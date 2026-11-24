# گزارش ممیزی تخصصی: Course Builder، Course Detail و Classroom

**تاریخ:** ۱۹ آبان ۱۴۰۳  
**محقق:** مهندس ارشد Full-Stack / متخصص QA  
**محدوده:** فقط سه بخش Course Builder، Course Detail و Classroom و مسیر داده مشترک

---

## خلاصه اجرایی

| بخش | وضعیت کلی | باگ‌های بحرانی | باگ‌های متوسط | باگ‌های جزئی | نمره |
|------|-----------|----------------|---------------|--------------|------|
| **Course Builder** | PARTIAL | 3 | 7 | 12 | 65/100 |
| **Course Detail** | PARTIAL | 2 | 5 | 8 | 70/100 |
| **Classroom** | PARTIAL | 4 | 6 | 10 | 60/100 |
| **یکپارچگی داده (Data Flow)** | FAIL | 5 | 3 | 2 | 45/100 |

---

## بخش اول: نقشه مسیر داده واقعی

```
Course Builder (Frontend)
    │
    ├── basicForm, mediaForm, curriculumForm, pricingForm, seoForm
    │       ↓ assemblePayload() / assembleMinimalPayload()
    │
    ├── API: POST /api/v1/courses (create) / PUT /api/v1/courses/:id (update)
    │       ↓ CourseController.createCourse / updateCourse
    │
    ├── Backend Validation (express-validator + Mongoose)
    │       ↓ Course Model (ICourse)
    │
    ├── Database: MongoDB (Course, Section, Lecture collections)
    │       ↓ syncSectionsAndLectures() → SectionService / LectureService
    │
    ├── Section.createSection / updateSection / deleteSection
    ├── Lecture.createLecture / updateLecture / deleteLecture
    ├── Lecture.addContentItem / updateContentItem / deleteContentItem
    │
    ▼
Course Detail (Frontend)
    │
    ├── API: GET /api/v1/courses/:slug (getCourseBySlug)
    │       ↓ CourseController.getCourseBySlug
    │       ↓ fetchCourseSections() → Section + Lecture aggregation
    │       ↓ sanitizeCourseMedia() / visibleLecture() / sanitizeLectureMedia()
    │       ↓ calculateCoursePricing() + getActiveCampaign()
    │
    ├── Response: Course + sections[] + lectures[] + pricing + reviews
    │
    ▼
Classroom (Frontend)
    │
    ├── API: GET /api/v1/courses/:courseId (getCourseBySlug with courseId)
    │       ↓ Same controller, same sanitization
    │
    ├── CourseAccessService.startLesson() → POST /courses/:courseId/access/lessons/:lectureId/start
    │       ↓ CourseAccessController.startLesson
    │       ↓ sequentialAccess / dailyQuota / freePreview logic
    │       ↓ Returns: streamUrl, token, isAccessible, lockReason
    │
    ├── VideoPlayerComponent plays from streamUrl (signed, expiring)
    │
    ├── Heartbeat: POST /courses/:courseId/access/heartbeat
    │       ↓ CourseAccessController.processHeartbeat
    │
    ├── Complete: POST /courses/:courseId/access/lessons/:lectureId/complete
    │       ↓ CourseAccessController.completeLesson
    │
    └── Progress: GET /courses/:courseId/access/progress
```

---

## بخش دوم: ممیزی Course Builder

### 2.1 اطلاعات اصلی دوره

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **عنوان (title)** | PARTIAL | ✅ Validation: minLength 10, maxLength 150 (Form + Mongoose)<br>❌ **Bug:** در `generateSlug()` کاراکترهای فارسی با regex `/[^\p{L}\p{N}-]/gu` حفظ می‌شوند اما در backend slug generator از `/[^\u0600-\u06FFa-z0-9-]/g` استفاده شده — ناهماهنگی در slug generation |
| **توضیحات کامل (description)** | PARTIAL | ✅ RichTextEditor + custom validator `richTextMinLength(100)`<br>❌ **Bug:** در `loadCourse()` اگر description خالی باشد، متن پیش‌فرض اضافه می‌شود اما این در `assemblePayload()` تکرار می‌شود → توضیحات در هر ذخیره طولانی‌تر می‌شود |
| **توضیحات کوتاه (shortDescription)** | PARTIAL | ✅ Validator `richTextMaxLength(300)`<br>❌ **Bug:** Mongoose schema maxlength=1000 اما express-validator 300 کاراکتر — تضاد |
| **Slug** | FAIL | ❌ **Critical:** Frontend `generateSlug()` با backend `generateUniqueSlugForCourse()` متفاوت است<br>• Frontend: Unicode `\p{L}` حفظ می‌کند<br>• Backend: فقط `\u0600-\u06FFa-z0-9` مجاز<br>→ در ویرایش، slug در frontend تغییر نمی‌کند اما backend ممکن است slug متفاوتی تولید کند |
| **دسته‌بندی/زیردسته** | PARTIAL | ✅ `onCategoryChange()` بارگذاری زیردسته‌ها<br>❌ **Bug:** در `loadCourse()` subcategory با `setTimeout(0)` ست می‌شود — race condition اگر API کند باشد |
| **SEO Fields** | PASS | ✅ metaTitle (60), metaDescription (200), keywords array |
| **فیلدهای شرطی (isFree → price=0)** | PASS | ✅ `pricingForm.get('isFree')` valueChanges handler قیمتها را صفر می‌کند |

### 2.2 ساختار فصل‌ها و درس‌ها

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **ایجاد/حذف/مرتب‌سازی فصل** | PASS | ✅ `addSection()`, `removeSection()`, `moveSectionUp/Down()`, `dropSection()` (CDK DragDrop) |
| **حفظ Order فصل‌ها** | PARTIAL | ✅ در `syncSectionsAndLectures()` بر اساس `secIdx` order ست می‌شود<br>❌ **Bug:** اگر کاربر فصل‌ها را drag-drop کند، `order` در backend به‌روزرسانی نمی‌شود — فقط title/description آپدیت می‌شوند |
| **فصل خالی** | PASS | ✅ مجاز است، در curriculumProgress محاسبه می‌شود |
| **شمارش درس‌ها و مدت‌زمان** | PARTIAL | ✅ `totalLectures()`, `totalDuration()` computed signals<br>❌ **Bug:** `totalDuration` اول از `contentItems` (videoDuration+audioDuration) می‌خواند، fallback به `lecture.duration` — اما `lecture.duration` در دقیقه است در حالی که `videoDuration` در ثانیه → محاسبه اشتباه |
| **ایجاد/ویرایش/حذف درس** | PASS | ✅ `addLecture()`, `removeLecture()`, `moveLectureUp/Down()`, `dropLecture()` |
| **جابه‌جایی درس بین فصل‌ها** | PARTIAL | ✅ `moveLectureToSection()` با API call<br>❌ **Bug:** در `syncSectionsAndLectures()` lectureها بر اساس `lecIdx` match می‌شوند — اگر درس جابه‌جا شده باشد، lecture اشتباهی آپدیت/حذف می‌شود |
| **عنوان، توضیحات، مدت‌زمان، وضعیت انتشار** | PARTIAL | ✅ فیلدها در FormGroup موجود<br>❌ **Bug:** `isPublished` در Lecture model پیش‌فرض `true` است اما در CourseBuilder UI برای آن کنترل وجود ندارد |
| **Preview رایگان (isFreePreview)** | PARTIAL | ✅ در Form و `unlockAllLectures()` برای دوره‌های رایگان<br>❌ **Bug:** در `syncSectionsAndLectures()` برای دوره رایگان `isFreePreview: true` و `isLocked: false` هاردکد شده — اما backend در `visibleLecture()` فقط `isFreePreview` چک می‌کند، `isLocked` نادیده گرفته می‌شود |
| **Content Items (سیستم جدید چندمحتوایی)** | PARTIAL | ✅ `contentItems` FormArray با ۶ نوع (video, rich-text, attachment, external-link, image, audio)<br>❌ **Critical Bug:** در `getContentItemsForSync()` فیلدهای `storage` و `processing` ارسال نمی‌شوند — در حالی که backend برای ویدیو `storage.key` ضروری دارد<br>❌ **Bug:** `ensureContentItemSaved()` برای placeholder content items payload خالی می‌فرستد → backend validation error |

### 2.3 آپلود رسانه

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Thumbnail** | PASS | ✅ آپلود به Cloudinary/Arvan، progress، preview، remove |
| **Promo Video** | PARTIAL | ✅ آپلود chunked با `VideoUploadService`<br>❌ **Bug:** `promoVideoType` در mediaForm هست اما در `assemblePayload()` هم `promoVideo` و هم `promoVideoUrl` ست می‌شوند — تضاد |
| **Lecture Video (Legacy)** | PARTIAL | ✅ آپلود مستقیم در `onLectureVideoSelected()`<br>❌ **Bug:** از سیستم قدیمی `videoUrl`/`videoFileName` استفاده می‌کند در حالی که مدل جدید `contentItems` است |
| **Content Item Video** | PARTIAL | ✅ `ensureContentItemSaved()` → `onContentItemVideoSelected()` با `contentItemId`<br>❌ **Critical:** در `ensureContentItemSaved()` برای type=video اگر `videoUrl` خالی باشد payload بدون `videoUrl`/`storage` ارسال می‌شود → backend content item ایجاد می‌شود اما `storage.key` ندارد → playback URL generation fail می‌کند |
| **فایل ضمیمه/تصویر/صوت** | PARTIAL | ✅ آپلود مشابه ویدیو<br>❌ **Bug:** `fileType` در attachment content item ست نمی‌شود (فقط `file.type` در آپلود) |

### 2.4 ذخیره و انتشار

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Auto-save (LocalStorage)** | PASS | ✅ Debounced 500ms، draft recovery banner، user-scoped key |
| **Auto-save (Server)** | PARTIAL | ✅ هر ۳۰ ثانیه در edit mode<br>❌ **Bug:** `autoSave()` فقط در `basicForm.valid` و `title` پر بودن اجرا می‌شود — اگر media/curriculum invalid باشد ذخیره نمی‌شود |
| **Save Draft (Manual)** | PASS | ✅ `saveDraft()` با `assemblePayload()` کامل |
| **Submit for Review** | PARTIAL | ✅ Validation: حداقل ۱ فصل، ۱ درس، قیمت (غیر رایگان)<br>❌ **Bug:** `overallProgress() < 70` warning می‌دهد اما جلوی submit را نمی‌گیرد — در حالی که backend ممکن است دوره ناقص را reject کند |
| **Learning Path Assignment (Admin)** | PARTIAL | ✅ UI کامل برای assign به مسیر موجود/جدید<br>❌ **Bug:** `assignCourseToExistingPath()` در `saveDraft()` و `submitForReview()` فراخوانی می‌شود اما اگر fail کند، دوره ذخیره/ارسال می‌شود اما path assignment rollback نمی‌شود |

### 2.5 باگ‌های بحرانی Course Builder

| # | باگ | فایل/خط | شدت | توضیح |
|---|-----|----------|------|-------|
| CB-01 | **Slug Generation Mismatch** | `course-builder.component.ts:1080` vs `courseController.ts:15` | 🔴 Critical | Frontend/Backend slug algorithm متفاوت → ویرایش دوره slug تغییر می‌دهد یا duplicate slug error |
| CB-02 | **Content Item Storage Missing** | `course-builder.component.ts:2200-2300` | 🔴 Critical | `getContentItemsForSync()` فیلد `storage` ارسال نمی‌کند → ویدیوهای content item playback ندارند |
| CB-03 | **Placeholder Content Item Creation** | `course-builder.component.ts:2450` | 🔴 Critical | `ensureContentItemSaved()` برای video بدون URL payload خالی می‌فرستد → backend validation error یا content item بی‌فایده |
| CB-04 | **Lecture Reorder Sync Bug** | `course-builder.component.ts:3150` | 🟠 High | `syncSectionsAndLectures()` بر اساس index match می‌کند — drag-drop باعث آپدیت درس اشتباه می‌شود |
| CB-05 | **Duration Unit Mismatch** | `course-builder.component.ts:380` | 🟠 High | `totalDuration` محاسبه: contentItems در ثانیه، lecture.duration در دقیقه |

---

## بخش سوم: ممیزی Course Detail

### 3.1 دریافت و نمایش داده‌ها

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **GET /courses/:slug** | PASS | ✅ `getCourseBySlug()` با populate instructor/category/subCategory |
| **Rating Real-time** | PASS | ✅ `computeCourseRating()` از Review collection محاسبه می‌کند |
| **Sections + Lectures** | PASS | ✅ `fetchCourseSections()` aggregation بهینه |
| **Sanitization** | PARTIAL | ✅ `sanitizeCourseMedia()`، `visibleLecture()`، `sanitizeLectureMedia()`<br>❌ **Bug:** `visibleLecture()` برای non-manager/non-enrolled فقط فیلدهای محدود برمی‌گرداند اما `isLocked` و `lockReason` ست نمی‌کند — frontend در `canAccessLesson()` فقط `isFreePreview` چک می‌کند |
| **Pricing + Campaign** | PASS | ✅ `calculateCoursePricing()` + `getActiveCampaign()` real-time |

### 3.2 تب‌ها و UI

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Curriculum Tab** | PARTIAL | ✅ Expand/collapse sections، progress per section<br>❌ **Bug:** `canAccessLesson()` فقط `isFreePreview` چک می‌کند — `visibleLecture()` برگردانده شده `isLocked` ندارد |
| **Instructor Tab** | PASS | ✅ Avatar، bio، expertise، social links |
| **Description Tab** | PASS | ✅ SanitizeHtmlPipe + MarkdownPipe |
| **Reviews Tab** | PARTIAL | ✅ Pagination، rating distribution، submit review<br>❌ **Bug:** `createReviewBySlug()` در ReviewService اما CourseDetail از `reviewService.createReviewBySlug()` استفاده می‌کند — نام متد متفاوت |

### 3.3 خرید و ثبت‌نام

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Add to Cart** | PASS | ✅ `cartService.addToCart()`، toast با action |
| **Free Enrollment** | PASS | ✅ `enrollInFreeCourse()` → redirect به `/learn/:courseId` |
| **Go to Learning** | PARTIAL | ✅ `goToLearning()` چک می‌کند `isFree` → enroll یا redirect<br>❌ **Bug:** اگر کاربر enrolled باشد اما `isEnrolled` signal هنوز آپدیت نشده باشد (race condition)، به cart می‌روید |

### 3.4 ویدیو معرفی (Promo Video)

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Playback URL** | PARTIAL | ✅ `getPromoVideoUrl()` → `/upload/stream/:courseId` برای protected<br>❌ **Bug:** `isUploadedPromoVideo()` منطق پیچیده و ناکامل — `promoVideoProtected` فیلد در Course model وجود ندارد (فقط در controller چک می‌شود) |
| **Embed URL (YouTube/Aparat)** | PASS | ✅ `getPromoVideoEmbedUrl()` با sanitizer |

### 3.5 باگ‌های بحرانی Course Detail

| # | باگ | فایل/خط | شدت | توضیح |
|---|-----|----------|------|-------|
| CD-01 | **Missing Lock Info in Visible Lecture** | `courseAccess.ts:35` | 🔴 Critical | `visibleLecture()` برای locked lessons `isLocked`/`lockReason` برمی‌گرداند → frontend نمی‌داند چرا قفل است |
| CD-02 | **Promo Video Protected Flag Missing** | `detail.component.ts:800` | 🟠 High | `isUploadedPromoVideo()` از فیلدهای غیرموجود (`promoVideoProtected`) استفاده می‌کند |
| CD-03 | **Review Submit Method Mismatch** | `detail.component.ts:580` | 🟠 High | `reviewService.createReviewBySlug()` vs backend route `/reviews/course/:slug` |
| CD-04 | **Enrollment Race Condition** | `detail.component.ts:680` | 🟡 Medium | `isEnrolled` signal آپدیت async، `goToLearning()` ممکن است stale value بخواند |

---

## بخش چهارم: ممیزی Classroom

### 4.1 بارگذاری دوره و درس‌ها

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Load Curriculum** | PARTIAL | ✅ `loadCourseCurriculum()` با `getCourseBySlug()`<br>❌ **Bug:** در SSR (`ngOnInit`) اگر `isPlatformBrowser` false باشد، `return` می‌کند و `loadCourseCurriculum` صدا زده نمی‌شود → hydration mismatch |
| **Lecture Selection** | PASS | ✅ از query param `lecture`، `findLectureById()`، `selectLecture()` |
| **Invalid Lecture Handling** | PASS | ✅ `invalidLectureId` signal، toast warning، fallback به درس اول |

### 4.2 کنترل دسترسی (CourseAccessService)

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **startLesson()** | PARTIAL | ✅ POST `/access/lessons/:lectureId/start` با options<br>❌ **Critical Bug:** `startLesson()` در `selectLecture()` فراخوانی می‌شود اما **response handling ناقص** — `res.data.streamUrl` ست می‌شود اما `res.data.isAccessible` چک نمی‌شود → اگر locked باشد، `videoUrl` خالی می‌ماند اما UI قفل نمی‌کند |
| **Sequential Access** | PARTIAL | ✅ Backend `sequentialAccess.service.ts` پیاده‌سازی شده<br>❌ **Bug:** Frontend `lectureLockReason()` منطق خودمان دارد (بر اساس `processing.status`) — با backend sequential access هم‌پوشانی/تضاد دارد |
| **Daily Quota** | PARTIAL | ✅ Backend `dailyQuota.service.ts`، response `remainingDailyQuota`<br>❌ **Bug:** Frontend quota info را ذخیره/نمایش نمی‌دهد (commented out) |
| **Free Preview** | PARTIAL | ✅ Backend `freePreview` settings<br>❌ **Bug:** `lectureLockReason()` فقط `processing.status` چک می‌کند — `isFreePreview` از backend response نادیده گرفته می‌شود |

### 4.3 پخش ویدیو

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Playback URL (Signed)** | PARTIAL | ✅ `fetchPlaybackUrl()` → `videoUploadService.getPlaybackUrl()`<br>❌ **Critical:** در `fetchPlaybackUrl()` اگر backend URL ندهد، **fallback به unprotected URL حذف شده** (comment: "Don't fallback - it will fail with 401/403") → اما `onVideoUrlExpired()` فقط `refreshCurrentVideoUrl()` صدا می‌زند که دوباره همان endpoint را می‌زند → **infinite loop اگر backend همیشه 404/401 بدهد** |
| **URL Refresh Timer** | PARTIAL | ✅ 90 دقیقه `startUrlRefreshTimer()`<br>❌ **Bug:** `refreshCurrentVideoUrl()` از `videoUploadService.refreshPlaybackUrl()` استفاده می‌کند که endpoint متفاوتی دارد — اگر fail کند، `fetchPlaybackUrl()` fallback می‌کند اما `resourceId` (contentItemId) گم می‌شود |
| **Heartbeat** | PARTIAL | ✅ `onVideoHeartbeat()` → `courseAccessService.processHeartbeat()`<br>❌ **Bug:** `token` خالی ارسال می‌شود (`token: ''`) — backend token را validate نمی‌کند |
| **Progress Persist** | PARTIAL | ✅ `onVideoProgressUpdate()` throttle 30s → `persistPosition()` → heartbeat<br>❌ **Bug:** `persistPosition()` token خالی می‌فرستد + `watchedDuration = currentPosition` (गलत — باید delta باشد) |

### 4.4 تکمیل درس و پیشرفت

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Auto-complete on Video End** | PARTIAL | ✅ `onVideoCompleted()` → `completeLesson()`<br>❌ **Bug:** `completeLesson()` فقط برای video فراخوانی می‌شود — content item های دیگر (quiz، assignment، rich-text) auto-complete ندارند |
| **Manual Toggle** | PASS | ✅ `toggleLectureComplete()` با optimistic update |
| **Quiz Integration** | PARTIAL | ✅ `submitQuiz()` → `progressService.submitQuiz()`<br>❌ **Bug:** Quiz completion در `completedLectures` اضافه می‌شود اما `completeLesson()` API فراخوانی نمی‌شود — backend progress sync نمی‌شود |
| **Assignment** | PARTIAL | ✅ `submitAssignment()` با آپلود فایل<br>❌ **Bug:** Assignment completion در `completedLectures` اضافه نمی‌شود |

### 4.5 یادداشت‌ها (Notes)

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Local Storage** | PASS | ✅ `saveNoteLocally()`، `readLocalNotes()`، `loadNoteForLecture()` |
| **Server Sync** | PARTIAL | ✅ `syncNoteToServer()` debounced 1.5s<br>❌ **Bug:** `timestamp` = `lastPosition()` (video position) — برای non-video lessons نامناسب |

### 4.6 پرسش و پاسخ (Q&A)

| مورد | وضعیت | توضیحات و شواهد |
|------|-------|------------------|
| **Load Discussions** | PARTIAL | ✅ `loadDiscussions()` با scope lecture/course<br>❌ **Bug:** `discussionService.getDiscussions()` پارامتر `lectureId` می‌گیرد اما backend route `/discussions/course/:courseId` است — mismatch |
| **Submit Question** | NOT TESTED | ⚠️ کد وجود دارد اما تست نشده |

### 4.7 باگ‌های بحرانی Classroom

| # | باگ | فایل/خط | شدت | توضیح |
|---|-----|----------|------|-------|
| CR-01 | **startLesson Response Ignored** | `classroom.component.ts:650` | 🔴 Critical | `isAccessible` چک نمی‌شود → locked lesson با videoUrl خالی render می‌شود |
| CR-02 | **Playback URL Fallback Removed** | `classroom.component.ts:780` | 🔴 Critical | Fallback حذف شده اما retry logic infinite loop می‌تواند ایجاد کند |
| CR-03 | **Heartbeat Token Empty** | `classroom.component.ts:850` | 🔴 Critical | `token: ''` ارسال می‌شود → backend validation fail |
| CR-04 | **Sequential Access vs Local Lock Logic Conflict** | `classroom.component.ts:200` | 🟠 High | `lectureLockReason()` محاسبه local، backend sequential access نادیده گرفته می‌شود |
| CR-05 | **Quiz/Assignment Not Auto-completing** | `classroom.component.ts:1150` | 🟠 High | فقط video `onVideoCompleted` دارد — content item های دیگر progress ندارند |
| CR-06 | **SSR Hydration Mismatch** | `classroom.component.ts:420` | 🟠 High | در SSR `return` می‌کند، curriculum لود نمی‌شود |

---

## بخش پنجم: ناهماهنگی‌های داده بین سه بخش (Data Flow Issues)

| # | ناهماهنگی | بخش‌های درگیر | شدت | توضیح |
|---|-----------|--------------|------|-------|
| DF-01 | **Slug Generation Algorithm** | Builder ↔ Detail | 🔴 Critical | Frontend/Backend الگوریتم متفاوت → slug در ویرایش تغییر می‌کند یا 404 |
| DF-02 | **Content Items Storage Field** | Builder → Detail/Classroom | 🔴 Critical | Builder `storage` ارسال نمی‌کند → Detail/Classroom playback URL ندارند |
| DF-03 | **Lecture Duration Unit** | Builder ↔ Detail ↔ Classroom | 🟠 High | Builder: ثانیه (contentItems) / دقیقه (lecture.duration) — Detail/Classroom: دقیقه |
| DF-04 | **isFreePreview vs isLocked** | Builder → Detail/Classroom | 🟠 High | Builder `isLocked` ست می‌کند، backend `visibleLecture()` فقط `isFreePreview` چک می‌کند |
| DF-05 | **Sequential Access Logic** | Builder (none) ↔ Classroom (local) ↔ Backend (service) | 🟠 High | سه منطق متفاوت: Builder ندارند، Classroom local، Backend service |
| DF-06 | **Promo Video Protected Flag** | Builder (promoVideoType) ↔ Detail (promoVideoProtected?) ↔ Backend (controller) | 🟠 High | Flag در model وجود ندارد، در controller محاسبه می‌شود، Detail حدس می‌زند |
| DF-07 | **Requirement Courses Mapping** | Builder (title match) ↔ Detail (requirementCourses array) | 🟡 Medium | Builder title match می‌کند، Detail از `requirementCourses` array استفاده می‌کند — اگر title تغییر کند broken می‌شود |
| DF-08 | **Content Item Types** | Builder (6 types) ↔ Lecture Model (6 types) ↔ Classroom (video only mostly) | 🟡 Medium | Classroom بیشتر روی video تمرکز دارد، rich-text/attachment/image/audio/external-link UI ندارند |
| DF-09 | **Quiz/Assignment Completion** | Builder (creates) ↔ Classroom (submits) ↔ Backend (progress) | 🟡 Medium | Builder quiz/assignment می‌سازد، Classroom submit می‌کند، اما auto-complete logic ندارند |
| DF-10 | **Pricing Calculation** | Builder (form) ↔ Detail (pricing service) ↔ Classroom (access) | 🟡 Medium | Builder form fields، Detail real-time pricing، Classroom access بر اساس isFree/enrolled |

---

## بخش ششم: اولویت‌بندی و پیشنهادات رفع

### اولویت ۱ (Critical - بلافاصله)

1. **CB-01, CB-02, CB-03** — Content Item system در Builder شکسته است، ویدیوها playback ندارند
2. **CR-01, CR-02, CR-03** — Classroom دسترسی و پخش ویدیو کار نمی‌کند
3. **CD-01** — Detail اطلاعات قفل درس را ندارد
4. **DF-01, DF-02** — ناهماهنگی‌های داده‌ای که کل جریان را می‌شکنند

### اولویت ۲ (High - این اسپرینت)

5. **CB-04, CB-05** — Sync و Duration bugs
6. **CR-04, CR-05, CR-06** — Sequential access، completion، SSR
7. **CD-02, CD-03, CD-04** — Promo video، review، enrollment
8. **DF-03, DF-04, DF-05** — Duration unit، lock logic، sequential access

### اولویت ۳ (Medium - اسپرینت بعد)

9. بقیه باگ‌های Medium/Minor
10. DF-06 تا DF-10 — ناهماهنگی‌های باقی‌مانده

---

## بخش هفتم: تست‌های پیشنهادی (End-to-End)

| سناریو | توضیح | انتظار |
|----------|--------|---------|
| **E2E-01** | ایجاد دوره با ۲ فصل، ۳ درس (video + rich-text + quiz)، ذخیره پیش‌نویس، ارسال بازبینی، تایید، مشاهده در Detail، ثبت‌نام، یادگیری در Classroom | همه مراحل بدون خطا |
| **E2E-02** | ویرایش دوره منتشر شده: تغییر slug، اضافه کردن content item، drag-drop درس بین فصل‌ها | slug ثابت بماند، content item playback داشته باشد، order در backend آپدیت شود |
| **E2E-03** | دوره رایگان: Builder → isFree=true → Detail → Enroll → Classroom → همه دروس accessible | همه دروس unlocked، progress ذخیره شود |
| **E2E-04** | دوره پولی با sequential access: درس ۲ قفل، درس ۱ کامل → درس ۲ باز شود | Sequential access در Classroom کار کند |
| **E2E-05** | ویدیو طولانی: پخش → heartbeat → refresh token (90 min) → ادامه تماشا | Token refresh بی‌خطا، position ذخیره شود |
| **E2E-06** | Quiz در درس: submit → pass → auto-complete → next lesson | Quiz completion progress sync شود |

---

## پیوست: فایل‌های کلیدی بررسی شده

### Course Builder
- `frontend/src/app/features/instructor/course-builder/course-builder.component.ts` (4200+ lines)
- `frontend/src/app/features/instructor/course-builder/course-builder.component.html`
- `frontend/src/app/core/services/section.service.ts`
- `frontend/src/app/core/services/lecture.service.ts`
- `frontend/src/app/core/services/video-upload.service.ts`

### Course Detail
- `frontend/src/app/features/courses/detail/detail.component.ts` (950+ lines)
- `frontend/src/app/features/courses/detail/detail.component.html`
- `backend/src/controllers/courseController.ts` (getCourseBySlug, getCourseById)
- `backend/src/utils/courseAccess.ts` (courseAccess, visibleLecture)
- `backend/src/services/pricing.service.ts` (calculateCoursePricing)

### Classroom
- `frontend/src/app/features/learning/classroom/classroom.component.ts` (1350+ lines)
- `frontend/src/app/features/learning/classroom/classroom.component.html`
- `frontend/src/app/core/services/course-access.service.ts`
- `backend/src/controllers/courseAccessController.ts` (startLesson, completeLesson, heartbeat)
- `backend/src/services/sequentialAccess.service.ts`
- `backend/src/services/dailyQuota.service.ts`

### Models
- `backend/src/models/Course.ts`
- `backend/src/models/Section.ts`
- `backend/src/models/Lecture.ts` (ContentItem schema)

---

**پایان گزارش**