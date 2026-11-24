# گزارش جامع معماری و برنامه‌ریزی پیاده‌سازی ثبت‌نام و تأیید مدرس

**پلتفرم همایون (Homayoon Academy)** — پلتفرم آموزش آنلاین فارسی RTL شبیه Udemy  
**تاریخ:** ۲۳ آبان ۱۴۰۳  
**نسخه:** ۱.۰ — فاز ۰: بررسی معماری و برنامه‌ریزی

---

## ۱. خلاصه اجرایی

این گزارش نتیجه بررسی کامل معماری بک‌اند (Node.js/Express/TypeScript/MongoDB) و فرانت‌اند (Angular ۱۹/TypeScript/Tailwind) پلتفرم همایون است. هدف، پیاده‌سازی یک **فرآیند رسمی ثبت‌نام مدرس با گردش کار تأیید ادمین** است که شامل اطلاعات شخصی، احراز هویت تلفن، سوابق تحصیلی/شغلی، آپلود اسناد و تأیید ادمین می‌شود.

**یافته کلیدی:** پلتفرم از قبل دارای مدل `User` با `instructorProfile`، داشبورد مدرس، سیستم احراز هویت JWT/OTP، آپلود فایل (Cloudinary برای تصاویر، S3/ArvanCloud برای ویدیو/اسناد)، پنل ادمین و سیستم اعلان است. **هیچ فرآیند رسمی ثبت‌نام/تأیید مدرس وجود ندارد** — کاربران می‌توانند مستقیماً با نقش `instructor` ثبت‌نام کنند (بدون تأیید).

---

## ۲. معماری فعلی پروژه

### ۲.۱ بک‌اند (Backend)
| مؤلفه | تکنولوژی/نسخه | مکان |
|----------|----------------|------|
| Runtime | Node.js (Express) | `backend/src/app.ts` |
| زبان | TypeScript (ES2022) | `backend/tsconfig.json` |
| دیتابیس | MongoDB + Mongoose | `backend/src/config/database.ts` |
| احراز هویت | JWT (Access ۱۵د، Refresh ۷ر) + Passport (Local, Google, GitHub) | `backend/src/config/passport.ts` |
| OTP | کد ۶ رقمی، هش bcrypt، انقضای ۱۵د، Redis برای rate-limit | `backend/src/controllers/authController.ts` |
| آپلود فایل | Cloudinary (تصاویر/اسناد کوچک) + S3/ArvanCloud (ویدیو/فایل‌های بزرگ) | `backend/src/config/cloudinary.ts`, `backend/src/services/storageService.ts` |
| مستندات API | Swagger/OpenAPI ۳ | `backend/src/config/swagger.ts` |
| تست | Jest + Supertest | `backend/jest.config.ts` |

### ۲.۲ فرانت‌اند (Frontend)
| مؤلفه | تکنولوژی/نسخه | مکان |
|----------|----------------|------|
| فریم‌ورک | Angular ۱۹ (Standalone Components, Signals) | `frontend/package.json` |
| استایل | Tailwind CSS + Angular Material | `frontend/tailwind.config.js` |
| مدیریت حالت | Signals + Service-based (بدون NgRx) | `frontend/src/app/core/services/state.service.ts` |
| مسیریابی | Lazy-loaded routes + Guards | `frontend/src/app/app.routes.ts` |
| RTL/فارسی | پشتیبانی کامل (jalali-moment, date-fns/fa-IR) | `frontend/src/app/shared/pipes/jalali-date.pipe.ts` |

### ۲.۳ مدل‌های دیتابیس کلیدی
- **User** (`backend/src/models/User.ts`): شامل `role` (student/instructor/admin)، `instructorProfile` (با `isApproved: boolean`)، `studentProfile`، `wallet`، توکن‌های Refresh، کدهای OTP
- **PendingRegistration** (`backend/src/models/PendingRegistration.ts`): برای ثبت‌نام مبتنی بر ایمیل+OTP (TTL ۱ ساعت)
- **Notification** (`backend/src/models/Notification.ts`): سیستم اعلان بلادرنگ (Socket.IO)
- **Course/Lecture/Section**: مدیریت دوره‌ها با `contentItems` (ویدیو، پیوست، صوت، متن غنی، لینک خارجی)

---

## ۳. تحلیل سیستم احراز هویت

### ۳.۱ مدیریت حساب کاربری
| ویژگی | وضعیت | مکان |
|----------|--------|------|
| ثبت‌نام تک‌مرحله‌ای (ایمیل/رمز/نقش) | ✅ پیاده‌سازی شده | `authController.ts:register()` |
| ورود (ایمیل/رمز) | ✅ پیاده‌سازی شده | `authController.ts:login()` |
| پروفایل کاربری | ✅ پیاده‌سازی شده | `userController.ts:getProfile/updateProfile` |
| فعال/غیرفعال‌سازی حساب | ✅ (فیلد `isActive`) | `User.ts` |
| محدودیت یکتای ایمیل/تلفن | ✅ (Index unique/sparse) | `User.ts` |
| جلوگیری از حساب تکراری | ✅ بررسی در `register()` | `authController.ts` |

### ۳.۲ احراز هویت OTP
| جنبه | پیاده‌سازی | جزئیات |
|--------|-------------|---------|
| تولید OTP | ✅ `generateOTP()` ۶ رقمی | `tokenUtils.ts` |
| ارسال OTP | ✅ ایمیل (Nodemailer) | `email.ts`, `emailTemplates.ts:otpEmailTemplate` |
| انقضا | ✅ ۱۵ دقیقه (`resetPasswordOTPExpires`, `phoneVerifyExpires`) | `User.ts` |
| تأیید OTP | ✅ bcrypt compare | `authController.ts:resetPassword()` |
| محدودیت نرخ (Rate Limit) | ✅ Redis (`otp:ratelimit:{email}`، ۱۰۰ در ساعت) | `authController.ts:checkOTPRateLimit()` |
| تأیید تلفن | ✅ فیلد `isPhoneVerified`، کد در `phoneVerifyCode` | `User.ts` |
| جلوگیری از Wiederverwendung | ✅ OTP پس از استفاده پاک می‌شود | `authController.ts` |

**نکته مهم:** OTP فعلی فقط برای **بازیابی رمز عبور** استفاده می‌شود. **تأیید تلفن در ثبت‌نام مدرس جدید است** و باید پیاده‌سازی شود.

### ۳.۳ JWT و جلسات
| مؤلفه | جزئیات |
|----------|---------|
| Access Token | ۱۵ دقیقه، امضای `JWT_ACCESS_SECRET` |
| Refresh Token | ۷ روز، امضای `JWT_REFRESH_SECRET`، ذخیره در دیتابیس (`refreshTokens` array) |
| ذخیره‌سازی | HttpOnly Cookies (Secure در Production، SameSite: None/ Lax) |
| چرخش/انقضا | Refresh token در هر استفاده تازه‌سازی می‌شود، حداکثر ۵ توکن همزمان |
| Middleware | `authenticate()` در `middlewares/auth.ts` — از Header یا Cookie می‌خواند |

### ۳.۴ نقش‌ها و مجوزها
| نقش | تعریف | مجوزها |
|------|--------|---------|
| `student` | پیش‌فرض | دسترسی به دوره‌ها، خرید، داشبورد دانشجو |
| `instructor` | قابل انتخاب در ثبت‌نام | داشبورد مدرس، ساخت دوره، مدیریت محتوا |
| `admin` | فقط اولین کاربر یا ترفیع دستی | پنل ادمین، مدیریت کاربران/دوره‌ها/پرداخت‌ها |

**مکان‌های بررسی مجوز:**
- Middleware: `authorize.ts` → `adminOnly`, `instructorOnly`, `studentOnly`
- Guard فرانت: `role.guard.ts` — بررسی `authService.userRole()` و `tenantService.getCurrentTenantRole()`
- کنترلرها: بررسی دستی `req.user.role` در برخی موارد

**یافته بحرانی:** در `authController.ts:register()` و `completeRegistration()`، کاربر می‌تواند مستقیماً `role: 'instructor'` بفرستد و بلافاصله `instructorProfile.isApproved: false` دریافت کند. **هیچ گردش کار تأیید ادمین وجود ندارد.**

---

## ۴. عملکردهای موجود مدرس

| ویژگی | وجود دارد؟ | مکان | کامل/ناقص | قابل استفاده مجدد؟ |
|----------|-----------|------|-----------|------------------|
| ثبت‌نام مدرس | ❌ (فقط ثبت‌نام عمومی با نقش instructor) | — | — | — |
| پروفایل مدرس | ✅ | `instructorProfile` در `User.ts`، `instructor-profile.component.ts` | کامل (headline, biography, socialLinks, expertise) | ✅ بله |
| داشبورد مدرس | ✅ | `instructor-dashboard.component.ts`، `dashboardController.ts` | کامل (آمار، دوره‌ها، فعالیت‌ها) | ✅ بله |
| ویرایش پروفایل مدرس | ✅ | `userController.ts:updateInstructorProfile` | کامل | ✅ بله |
| سوابق تحصیلی/شغلی | ❌ | — | — | ❌ نیاز به فیلدهای جدید |
| تأیید مدرس | ❌ (فقط فیلد `isApproved: false` پیش‌فرض) | `User.ts` | ناقص | ❌ نیاز به گردش کار |
| گردش کار تأیید ادمین | ❌ | — | — | ❌ نیاز به پیاده‌سازی کامل |
| آپلود اسناد مدرس | ❌ | — | — | ❌ نیاز به پیاده‌سازی |
| اعلان تأیید/رد | ❌ | — | — | ❌ استفاده از `createNotification()` |

---

## ۵. تحلیل آپلود فایل و ذخیره‌سازی

### ۵.۱ زیرساخت‌های موجود
| سرویس | کاربرد | امنیت |
|--------|--------|-------|
| **Cloudinary** | آواتار، تصاویر، اسناد کوچک (PDF, DOC) | Public/Authenticated URLs، Signed URLs برای محتوای خصوصی |
| **S3/ArvanCloud** | ویدیوهای دوره، فایل‌های بزرگ (>۱۰۰MB) | Presigned URLs، Multipart Upload، Streaming با Range Request |
| **Local Uploads** | Fallback برای توسعه | `/uploads` با `express.static` |

### ۵.۲ کنترلر آپلود (`uploadController.ts`)
- `getPresignedUrl`: تولید URL امضا شده برای آپلود مستقیم به S3
- `proxyUpload`: آپلود از طریق بک‌اند (MemoryStorage، حداکثر ۵۰۰MB) — **مناسب برای اسناد مدرس**
- `initMultipartUpload`/`completeMultipartUpload`: آپلود چندبخشی برای فایل‌های بزرگ
- `serveFile`: اندپوینت هوشمند برای نمایش/دانلود اسناد (PDF inline، ZIP download)

### ۵.۳ اعتبارسنجی فایل (`upload.ts`)
| فیلتر | فرمت‌های مجاز | حداکثر حجم |
|--------|--------------|------------|
| `imageFilter` | JPEG, PNG, GIF, WebP | ۵MB |
| `documentFilter` | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, ZIP, RAR, TXT | ۲۰MB |
| `anyFileFilter` | همه موارد بالا + ویدیو/صوت | ۵GB (ENV) |

### ۵.۴ توصیه برای اسناد مدرس
**استفاده از `proxyUpload` با `documentFilter` و ذخیره در Cloudinary (resource_type: 'raw') یا S3 با ACL Private.**  
Cloudinary از قبل برای تصاویر پیکربندی شده؛ برای اسناد حساس (PDF شناسنامه، مدرک تحصیلی) **S3 با Signed URL برای دانلود امن** ترجیح داده می‌شود.

---

## ۶. تحلیل پنل ادمین

### ۶.۱ مسیرها و کامپوننت‌ها
| صفحه | مسیر | کامپوننت |
|------|------|----------|
| داشبورد ادمین | `/admin/dashboard` | `admin-dashboard.component.ts` |
| مدیریت کاربران | `/admin/users` | `admin-users.component.ts` |
| مدیریت دوره‌ها | `/admin/courses` | `admin-courses.component.ts` |
| پرداخت‌ها | `/admin/payments` | `admin-payments.component.ts` |
| تیکت‌ها | `/admin/tickets` | `admin-tickets.component.ts` |
| دسته‌بندی‌ها | `/admin/categories` | `categories-management.component.ts` |
| کمپین‌ها | `/admin/campaigns` | `campaigns-list/form.component.ts` |

### ۶.۲ قابلیت‌های موجود در `admin-users.component.ts`
- جداول با صفحه‌بندی، جستجو، فیلتر نقش/وضعیت
- مسدود/رفع مسدود کردن کاربر با دلیل (Modal)
- آمار کاربران (دانشجو/مدرس/ادمین/مسدود)
- Pipe تاریخ جلالی، Directive fallback تصویر

### ۶.۳ کامپوننت‌های قابل استفاده مجدد
- `PaginationComponent` — صفحه‌بندی استاندارد
- `ConfirmModalComponent` — تایید عملیات حساس
- `RichTextEditorComponent` — ویرایشگر متن غنی
- `ImageFallbackDirective` — مدیریت تصاویر خراب
- `JalaliDatePipe` — نمایش تاریخ شمسی

**مکان پیشنهادی برای مدیریت درخواست‌های مدرس:** `/admin/instructor-applications` (صفحه جدید در پنل ادمین)

---

## ۷. تحلیل معماری فرانت‌اند

### ۷.۱ صفحات احراز هویت موجود
| صفحه | مسیر | کامپوننت | ویژگی‌ها |
|------|------|----------|---------|
| ثبت‌نام | `/auth/register` | `register.component.ts` | ۳ مرحله (ایمیل → رمز → نقش/نام)، اعتبارسنجی قوی رمز، OAuth |
| ورود | `/auth/login` | `login.component.ts` | ایمیل/رمز، فراموشی رمز، OAuth |
| تکمیل ثبت‌نام OAuth | `/auth/complete-registration` | `complete-registration.component.ts` | انتخاب نقش (دانشجو/مدرس) + رمز |
| فراموشی رمز | `/auth/forgot-password` | `forgot-password.component.ts` | ایمیل → OTP |
| بازنشانی رمز | `/auth/reset-password` | `reset-password.component.ts` | OTP + رمز جدید |

### ۷.۲ سرویس‌های اصلی
- `AuthService` (`auth.service.ts`): مدیریت توکن، پروفایل، ثبت‌نام، ورود، OTP
- `TokenService` (`token.service.ts`): ذخیره/خواندن توکن‌ها در localStorage/cookies
- `ApiService` (`api.service.ts`): HttpClient wrapper با Interceptorها
- `StateService` (`state.service.ts`): Signals برای کاربر، سبد خرید، دوره جاری

### ۷.۳ Guardها و Interceptorها
| Guard | کارکرد |
|-------|--------|
| `authGuard` | محافظت مسیرهای نیازمند احراز هویت |
| `unauthGuard` | جلوگیری از دسترسی به `/auth/*` برای کاربران لاگین‌کرده |
| `roleGuard` | بررسی نقش (global + tenant) |
| `unsavedChangesGuard` | جلوگیری از خروج ناخواسته از course-builder |

| Interceptor | کارکرد |
|-------------|--------|
| `authInterceptor` | تزریق Access Token، مدیریت 401/Refresh Token |
| `errorInterceptor` | مدیریت خطاهای سراسری |
| `loadingInterceptor` | نشان‌دهنده بارگذاری سراسری |
| `tenantInterceptor` | هدر `X-Tenant-ID` |

### ۷.۴ الگوهای فرم
- **Reactive Forms** با `FormBuilder`، `Validators`، اعتبارسنجی سفارشی (`passwordMatchValidator`)
- **Multi-step Forms** با `signal` برای مدیریت مرحله (`register.component.ts`)
- **Rich Text Editor** برای بیوگرافی/توضیحات (`RichTextEditorComponent`)

---

## ۸. مدل‌های دیتابیس و روابط

### ۸.۱ مدل User (موجود)
```typescript
// فیلدهای مرتبط با مدرس
instructorProfile: {
  headline?: string;
  biography?: string;
  website?: string;
  socialLinks?: { linkedin, twitter, youtube, instagram };
  expertise?: string[];
  totalStudents: number;
  totalCourses: number;
  totalReviews: number;
  averageRating: number;
  totalEarnings: number;
  isApproved: boolean;  // ← پیش‌فرض false، اما بدون گردش کار تأیید
}
```

### ۸.۲ مدل‌های جدید مورد نیاز
| مدل | فیلدهای کلیدی | ارتباط |
|------|--------------|--------|
| `InstructorApplication` | `user` (ref User), `personalInfo`, `phoneVerification`, `professionalInfo`, `documents[]`, `status` (pending/approved/rejected/correction_requested), `adminNotes`, `reviewedBy`, `reviewedAt` | ۱-۱ با User |
| `InstructorDocument` | `application` (ref), `type` (national_id/degree/certificate/other), `fileUrl`, `fileName`, `fileSize`, `storageKey`, `isVerified` | ۱-N با Application |

---

## ۹. تحلیل ریسک‌های امنیتی و توصیه‌های کاهش ریسک

| # | ریسک | شدت | مکان/مورد | کاهش ریسک پیشنهادی |
|---|------|-----|-----------|---------------------|
| ۱ | **افشای کد ملی** | بحرانی | فیلد جدید `nationalId` | رمزنگاری در دیتابیس (AES-256)، عدم نمایش در APIهای عمومی، لاگ‌گذاری حساس |
| ۲ | **کد ملی تکراری** | بالا | ثبت‌نام چندگانه | Index یکتا در `InstructorApplication.nationalId`، بررسی در کنترلر |
| ۳ | **درخواست تکراری** | بالا | کاربر موجود درخواست می‌دهد | Constraint یکتا روی `user` در `InstructorApplication`، بررسی `instructorProfile.isApproved` |
| ۴ | **دسترسی غیرمجاز به اسناد** | بحرانی | دانلود PDFهای حساس | Signed URL با انقضای کوتاه (۱۰ دقیقه)، بررسی مالکیت/نقش ادمین در `serveFile` |
| ۵ | **افشای عمومی اسناد خصوصی** | بالا | Cloudinary/S3 Public ACL | ذخیره با `resource_type: 'raw'` + `type: 'authenticated'`،Signed URL برای دانلود |
| ۶ | **دور زدن OTP** | متوسط | تأیید تلفن | Rate-limit سخت‌گیرانه (۳ در ۱۰ دقیقه)، انقضای ۵ دقیقه، هش bcrypt، عدم نمایش OTP در لاگ |
| ۷ | **اختصاص نقش مدرس بدون تأیید** | بحرانی | `register()`، `completeRegistration()` | حذف اختصاص مستقیم نقش instructor، فقط پس از `Application.status === 'approved'` |
| ۸ | **دسترسی مستقیم API بدون تأیید** | بالا | مسیرهای `/instructor/*` | Middleware `instructorOnly` + بررسی `req.user.instructorProfile.isApproved === true` |
| ۹ | **شرط رقابتی در تأیید** | متوسط | دو ادمین همزمان بررسی | تراکنش MongoDB (`findOneAndUpdate` با atomic update)، قفل خوش‌بینانه |
| ۱۰ | **تغییر غیرمجاز پس از تأیید** | متوسط | ویرایش پروفایل مدرس | قفل فیلدهای حیاتی (کد ملی، اسناد) پس از تأیید، لاگ تغییرات |
| ۱۱ | **اطلاعات حساس در لاگ** | متوسط | `console.log` در کنترلرها | Sanitize کردن لاگ‌ها، عدم لاگ‌گذاری OTP، کد ملی، توکن‌ها |
| ۱۲ | **آپلود فایل مخرب** | بالا | اسناد مدرس | اعتبارسنجی MIME + Extension، اسکن آنتی‌ویروس (ClamAV)، محدودیت حجم، ذخیره در مسیر جداگانه |

---

## ۱۰. مؤلفه‌ها و سرویس‌های قابل استفاده مجدد

| مؤلفه | نوع | مکان | قابل استفاده برای ثبت‌نام مدرس؟ |
|----------|-----|------|-------------------------------|
| `User.instructorProfile` | Model | `User.ts` | ✅ بله — گسترش با فیلدهای جدید |
| `authController.register/login/OTP` | Controller | `authController.ts` | ✅ بله — الگو برای OTP تلفن |
| `createNotification()` | Service | `notificationController.ts` | ✅ بله — اعلان تأیید/رد/تصحیح |
| `proxyUpload` + `documentFilter` | Upload | `uploadController.ts`, `upload.ts` | ✅ بله — آپلود اسناد مدرس |
| `storageService.getSignedDownloadUrl` | Storage | `storageService.ts` | ✅ بله — دانلود امن اسناد ادمین |
| `admin-users.component.ts` | Frontend | `admin-users.component.ts` | ✅ بله — الگو برای لیست درخواست‌ها |
| `ConfirmModalComponent` | UI Component | `shared/components/confirm-modal` | ✅ بله — تایید رد/تأیید |
| `RichTextEditorComponent` | UI Component | `shared/components/rich-text-editor` | ✅ بله — بیوگرافی/توضیحات |
| `roleGuard` + `instructorOnly` | AuthZ | `role.guard.ts`, `authorize.ts` | ✅ بله — محافظت مسیرهای مدرس |
| `multi-step form pattern` | Pattern | `register.component.ts` | ✅ بله — فرم چندمرحله‌ای ثبت‌نام مدرس |
| `ApiService` + `authInterceptor` | HTTP | `api.service.ts` | ✅ بله — تمام فراخوانی‌های API |

---

## ۱۱. ویژگی‌های گمشده (Gap Analysis)

| حوزه | ویژگی گمشده | اولویت |
|-------|-------------|--------|
| **دیتابیس** | مدل `InstructorApplication`، `InstructorDocument` | 🔴 بحرانی |
| **دیتابیس** | فیلدهای `nationalId`, `dateOfBirth`, `gender`, `education[]`, `workExperience[]`, `achievements` در Application | 🔴 بحرانی |
| **بک‌اند** | کنترلر `instructorApplicationController` (CRUD + Admin actions) | 🔴 بحرانی |
| **بک‌اند** | Middleware بررسی `instructorProfile.isApproved` برای مسیرهای مدرس | 🔴 بحرانی |
| **بک‌اند** | OTP تلفن (تولید، ارسال SMS، تأیید، rate-limit) | 🔴 بحرانی |
| **بک‌اند** | گردش کار ادمین: مشاهده، تأیید، رد، درخواست تصحیح | 🔴 بحرانی |
| **بک‌اند** | اعلان‌های بلادرنگ برای متقاضی و ادمین | 🟠 بالا |
| **بک‌اند** | آپلود اسناد با ذخیره امن (S3 Private + Signed URL) | 🟠 بالا |
| **فرانت‌اند** | صفحه ثبت‌نام مدرس چندمرحله‌ای (`/instructor/apply`) | 🔴 بحرانی |
| **فرانت‌اند** | کامپوننت آپلود چندفایلی با پیش‌نمایش و حذف | 🟠 بالا |
| **فرانت‌اند** | صفحه مدیریت درخواست‌ها در پنل ادمین (`/admin/instructor-applications`) | 🔴 بحرانی |
| **فرانت‌اند** | صفحه جزئیات درخواست برای ادمین (مشاهده اطلاعات، پیش‌نمایش اسناد) | 🟠 بالا |
| **امنیت** | رمزنگاری کد ملی، لاگ‌گذاری امن، اسکن فایل | 🟠 بالا |
| **تست** | تست‌های واحد و یکپارچه برای گردش کار کامل | 🟡 متوسط |

---

## ۱۲. تضادها و تغییرات شکست‌دهنده بالقوه

| تغییر | خطر شکست | استراتژی کاهش |
|--------|-----------|----------------|
| اضافه کردن middleware `requireApprovedInstructor` | مسیرهای موجود `/instructor/*` برای کاربران با `isApproved: false` قفل می‌شوند | **مرحله‌بندی:** اول middleware اضافه شود، سپس کاربران موجود بررسی/تأیید شوند |
| تغییر `register()` برای عدم اجازه نقش instructor مستقیم | کاربران جدید نمی‌توانند مستقیماً مدرس شوند | **سازگار با عقب:** فقط نقش `student` مجاز، مسیر جدید `/instructor/apply` برای درخواست |
| اضافه کردن Index یکتا روی `nationalId` | داده‌های موجود تکراری ممکن است خطا دهد | **مهاجرت:** ابتدا داده‌ها تمیز شوند، سپس Index اضافه شود |
| تغییر `instructorProfile.isApproved` از Boolean به Enum | کدهای موجود که Boolean چک می‌کنند | **سازگار:** نگه داشتن Boolean، اضافه کردن `approvalStatus` Enum جداگانه |

---

## ۱۳. نقشه راه پیاده‌سازی (Implementation Roadmap)

### فاز ۱: پایگاه داده و مدل‌ها (هفته ۱)
| تسک | فایل‌های موجود برای استفاده مجدد | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|-------------------------------|---------------------|----------|-------------|
| ۱.۱ ایجاد مدل `InstructorApplication` | `User.ts` (الگو) | `backend/src/models/InstructorApplication.ts` | — | مدل با تمام فیلدها، Indexها، متدها |
| ۱.۲ ایجاد مدل `InstructorDocument` | `User.ts` (الگو) | `backend/src/models/InstructorDocument.ts` | ۱.۱ | مدل با storage info، نوع سند |
| ۱.۳ مهاجرت User: اضافه کردن `nationalId` (اختیاری، رمزنگاری) | `User.ts` | `backend/src/models/User.ts` (تغییر) | ۱.۱ | فیلد رمزنگاری شده، Index یکتا |
| ۱.۴ Seed/مиграشن برای داده‌های موجود | `backend/src/seeds/` | `backend/src/migrations/2024_add_instructor_application.ts` | ۱.۱-۱.۳ | اجرا بدون خطا، داده‌های موجود حفظ |

### فاز ۲: بک‌اند — احراز هویت OTP تلفن (هفته ۱-۲)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۲.۱ سرویس ارسال SMS (استراکچر Provider) | `email.ts` (الگو) | `backend/src/services/sms.service.ts` | — | اینترفیس واحد، Providerهای قابل تعویض |
| ۲.۲ OTP تلفن: تولید، ذخیره (Redis + DB), ارسال | `authController.ts:forgotPassword` | `backend/src/controllers/authController.ts` (اضافه) | ۲.۱ | API `sendPhoneOTP`، `verifyPhoneOTP` |
| ۲.۳ Rate-limit سخت‌گیرانه برای SMS | `checkOTPRateLimit` | `authController.ts` (تغییر) | ۲.۲ | ۳ درخواست در ۱۰ دقیقه، بلاک ۱ ساعته |
| ۲.۴ اعتبارسنجی ورودی (Validator) | `authValidator.ts` | `backend/src/validators/authValidator.ts` (اضافه) | ۲.۲ | `phoneOTPValidator`, `verifyPhoneOTPValidator` |

### فاز ۳: بک‌اند — کنترلر درخواست مدرس (هفته ۲)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۳.۱ کنترلر `InstructorApplicationController` | `userController.ts` (الگو) | `backend/src/controllers/instructorApplicationController.ts` | فاز ۱ | CRUD کامل + `submit`, `getMyApplication` |
| ۳.۲ اکشن‌های ادمین: `approve`, `reject`, `requestCorrection` | `admin-users.component.ts` (الگو) | `instructorApplicationController.ts` (اضافه) | ۳.۱ | تراکنش اتمیک، اعلان، تغییر نقش |
| ۳.۳ Middleware `requireApprovedInstructor` | `authorize.ts` | `backend/src/middlewares/requireApprovedInstructor.ts` | ۳.۱ | بررسی `isApproved === true` |
| ۳.۴ اعمال Middleware روی مسیرهای `/instructor/*` | `app.routes.ts` (فرانت) / `instructorRoutes.ts` | `backend/src/routes/instructorRoutes.ts` (تغییر) | ۳.۳ | مسیرهای مدرس برای غیرتأیید شده ۴۰۳ |
| ۳.۵ آپلود اسناد در درخواست | `proxyUpload`, `documentFilter` | `instructorApplicationController.ts` (استفاده) | فاز ۵ | چندفایلی، اعتبارسنجی، ذخیره امن |

### فاز ۴: بک‌اند — مسیرها و اعلان‌ها (هفته ۲-۳)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۴.۱ روت‌های درخواست مدرس | `index.ts` | `backend/src/routes/instructorApplicationRoutes.ts` | فاز ۳ | RESTful، محافظت شده |
| ۴.۲ روت‌های ادمین درخواست‌ها | `adminAccessRoutes.ts` (الگو) | `backend/src/routes/adminInstructorApplicationRoutes.ts` | فاز ۳ | فقط ادمین، صفحه‌بندی، فیلتر |
| ۴.۳ اعلان‌های بلادرنگ | `createNotification()` | `instructorApplicationController.ts` (استفاده) | فاز ۳ | تأیید/رد/تصحیح → اعلان + ایمیل |
| ۴.۴ قالب ایمیل‌های جدید | `emailTemplates.ts` | `backend/src/utils/emailTemplates.ts` (اضافه) | ۴.۳ | `applicationSubmitted`, `applicationApproved`, `applicationRejected`, `applicationCorrectionRequested` |

### فاز ۵: ذخیره‌سازی امن اسناد (هفته ۲-۳، موازی)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۵.۱ پیکربندی S3 Private Bucket برای اسناد | `storageService.ts` | `backend/src/config/storage.ts` (اضافه/تغییر) | — | Bucket جداگانه، ACL Private |
| ۵.۲ متد `getSignedDownloadUrl` برای ادمین | `storageService.ts` (موجود) | `storageService.ts` (تأیید کارکرد) | ۵.۱ | URL امضا شده ۱۰ دقیقه، نام فایل اصلی |
| ۵.۳ آپلود اسناد در `proxyUpload` با مسیر جداگانه | `uploadController.ts` | `uploadController.ts` (تغییر مسیر folder) | ۵.۱ | Folder: `instructor-applications/{applicationId}/` |
| ۵.۴ اعتبارسنجی محتوای فایل (MIME + Magic bytes) | `documentFilter` | `backend/src/middlewares/upload.ts` (تقویت) | ۵.۱ | رد فایل‌های مخرب، لاگ امنیتی |

### فاز ۶: فرانت‌اند — ثبت‌نام مدرس (هفته ۳-۴)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۶.۱ سرویس `InstructorApplicationService` | `instructor.service.ts` | `frontend/src/app/core/services/instructor-application.service.ts` | فاز ۴ | متدهای `submit`, `getMy`, `uploadDocument` |
| ۶.۲ صفحه چندمرحله‌ای `/instructor/apply` | `register.component.ts` (الگو) | `frontend/src/app/features/instructor/apply/` (پوشه جدید) | ۶.۱ | ۴ مرحله: اطلاعات شخصی → تلفن/OTP → سوابق → اسناد |
| ۶.۳ کامپوننت آپلود چندفایلی | `video-uploader.component.ts` (الگو) | `frontend/src/app/shared/components/document-uploader/` | ۶.۲ | Drag-drop، پیش‌نمایش، حذف، نوار پیشرفت |
| ۶.۴ کامپوننت‌های فرم: سوابق تحصیلی/شغلی (Dynamic Array) | `course-builder.component.ts` (الگو) | `frontend/src/app/features/instructor/apply/components/` | ۶.۲ | افزودن/حذف/ویرایش ردیف، اعتبارسنجی |
| ۶.۵ Guard مسیر `/instructor/apply` | `authGuard`, `roleGuard` | `frontend/src/app/app.routes.ts` (اضافه) | ۶.۲ | فقط کاربر احراز هویت شده، نقش student/instructor |

### فاز ۷: فرنت‌اند — پنل ادمین مدیریت درخواست‌ها (هفته ۴)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۷.۱ سرویس ادمین برای درخواست‌ها | `api.service.ts` | `frontend/src/app/core/services/admin-instructor-application.service.ts` | فاز ۴ | `getAll`, `getDetail`, `approve`, `reject`, `requestCorrection` |
| ۷.۲ صفحه لیست `/admin/instructor-applications` | `admin-users.component.ts` (الگو) | `frontend/src/app/features/admin/instructor-applications/` | ۷.۱ | جدول، جستجو، فیلتر وضعیت، صفحه‌بندی |
| ۷.۳ صفحه جزئیات/مشاهده اسناد | `admin-users.component.ts` (Modal) | `instructor-applications/detail.component.ts` | ۷.۲ | نمایش تمام اطلاعات، پیش‌نمایش PDF/تصویر، دانلود امن |
| ۷.۴ Modal تأیید/رد/تصحیح با دلیل | `ConfirmModalComponent` | `instructor-applications/action-modal.component.ts` | ۷.۳ | فرم دلیل، تایید، اعلان بلادرنگ |
| ۷.۵ اضافه کردن منو در سایدبار ادمین | `navbar.component.ts` / `admin-dashboard.component.ts` | `frontend/src/app/shared/components/navbar/navbar.component.ts` | ۷.۲ | لینک به `/admin/instructor-applications` |

### فاز ۸: امنیت و سخت‌سازی (هفته ۴-۵)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۸.۱ رمزنگاری کد ملی (AES-256) | `helpers.ts` | `backend/src/utils/encryption.ts` (جدید) | فاز ۱ | رمزنگاری/رمزگشایی، کلید از ENV |
| ۸.۲ Sanitize لاگ‌ها (حذف PII) | `asyncHandler.ts` | `backend/src/middlewares/sanitizeLogs.middleware.ts` | همه | عدم لاگ OTP، کد ملی، توکن |
| ۸.۳ اسکن آنتی‌ویروس آپلودها | `upload.ts` | `backend/src/middlewares/virusScan.middleware.ts` | فاز ۵ | ClamAV integration، async، non-blocking |
| ۸.۴ تست نفوذ و بررسی امنیتی | — | گزارش جداگانه | ۸.۱-۸.۳ | صفر آسیب‌پذیری بحرانی/بالا |

### فاز ۹: تست و مستندسازی (هفته ۵)
| تسک | فایل‌های موجود | فایل‌های جدید/تغییر | وابستگی | معیار پذیرش |
|-----|----------------|---------------------|----------|-------------|
| ۹.۱ تست واحد کنترلرها | `jest.config.ts` | `backend/src/__tests__/instructorApplication.test.ts` | فاز ۳-۴ | پوشش ۸۰٪+، سناریوهای مثبت/منفی |
| ۹.۲ تست یکپارچه گردش کار کامل | `backend/src/tests/` | `backend/src/tests/instructorApplicationFlow.test.ts` | ۹.۱ | ثبت‌نام → OTP → اسناد → تأیید ادمین → فعال‌سازی |
| ۹.۳ تست فرانت‌اند (Component/Service) | `karma/jasmine` | `frontend/src/app/features/instructor/apply/*.spec.ts` | فاز ۶-۷ | تست فرم، ناوبری، آپلود |
| ۹.۴ مستندات API (Swagger) | `swagger.ts` | Annotations در کنترلرهای جدید | فاز ۴ | مستندات کامل در `/api-docs` |
| ۹.۵ مستندات توسعه‌دهنده | — | `INSTRUCTOR_REGISTRATION_IMPLEMENTATION_GUIDE.md` | همه | راهنمای کامل پیاده‌سازی |

---

## ۱۴. پرامپت اجرایی فاز بعد (Implementation Prompt)

> **نکته:** پرامپت زیر برای یک Agent کدنویسی طراحی شده تا مستقیماً پیاده‌سازی را آغاز کند بدون نیاز به تکرار بررسی معماری.

---

### پرامپت پیاده‌سازی ثبت‌نام و تأیید مدرس (Instructor Registration & Approval)

#### زمینه
پلتفرم همایون (Homayoon Academy) — Udemy-like Persian RTL platform.  
معماری: **Backend:** Node.js/Express/TypeScript, MongoDB/Mongoose, JWT+OTP, Cloudinary+S3(ArvanCloud).  
**Frontend:** Angular 19, Signals, Tailwind, Angular Material, Standalone Components.

#### هدف
پیاده‌سازی **فرآیند کامل ثبت‌نام مدرس با گردش کار تأیید ادمین** بر اساس معماری موجود، با استفاده مجدد از مؤلفه‌های موجود و بدون شکست دادن عملکردهای فعلی.

---

#### ۱. تغییرات دیتابیس (Backend/Models)

**فایل جدید:** `backend/src/models/InstructorApplication.ts`
```typescript
// فیلدهای الزامی:
- user: ObjectId (ref User, unique) — مالک درخواست
- personalInfo: { fullName, nationalId (encrypted), dateOfBirth, gender, email, phone, avatar }
- phoneVerification: { otpCode (hashed), otpExpires, verified: boolean, verifiedAt }
- professionalInfo: {
    mainSpecialty: string,
    additionalSpecialties: string[],
    education: [{ institution, fieldOfStudy, degree, documentRef: ObjectId }],
    workExperience: [{ organization, position, description, documentRef: ObjectId }],
    achievements: string
  }
- documents: ObjectId[] (ref InstructorDocument)
- status: Enum ['pending', 'under_review', 'approved', 'rejected', 'correction_requested']
- adminNotes: string
- reviewedBy: ObjectId (ref User)
- reviewedAt: Date
- submittedAt: Date
- createdAt, updatedAt (timestamps)

// Indexes:
- user (unique)
- nationalId (unique, sparse)
- status + createdAt
- reviewedBy
```

**فایل جدید:** `backend/src/models/InstructorDocument.ts`
```typescript
- application: ObjectId (ref InstructorApplication)
- type: Enum ['national_id', 'degree', 'certificate', 'work_proof', 'other']
- fileName: string
- fileSize: number
- mimeType: string
- storage: { provider: 'arvan', bucket, key, originalFileName }
- downloadUrl: string (signed URL pattern)
- isVerified: boolean
- uploadedAt: Date
```

**تغییر در `User.ts`:**
- اضافه کردن `nationalId` (اختیاری، رمزنگاری شده، unique sparse) — برای جلوگیری از ثبت‌نام تکراری
- `instructorProfile.isApproved` باقی بماند (Boolean) برای سازگاری عقب
- اضافه کردن `instructorProfile.approvalStatus` Enum ['none', 'pending', 'approved', 'rejected'] برای جزئیات بیشتر

**مиграشن:** `backend/src/migrations/2024_add_instructor_application.ts` — ایجاد مدل‌ها، Indexها، داده‌های پیش‌فرض.

---

#### ۲. احراز هویت OTP تلفن (Backend/Auth)

**فایل جدید:** `backend/src/services/sms.service.ts`
```typescript
// اینترفیس واحد برای Providerهای SMS (Kavenegar, Melipayamak, و غیره)
interface SMSProvider {
  send(to: string, templateId: string, tokens: Record<string, string>): Promise<boolean>;
  verifyDelivery(messageId: string): Promise<boolean>;
}

class SMSService {
  private provider: SMSProvider;
  async sendOTP(phone: string, code: string): Promise<void>;
}
```
- پیکربندی از ENV: `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_TEMPLATE_OTP`
- در Development: لاگ کد OTP در کنسول (مشابه ایمیل)

**تغییر در `authController.ts`:**
```typescript
// POST /api/v1/auth/send-phone-otp
// { phone: "09xxxxxxxxx" }
// Rate-limit: 3 در ۱۰ دقیقه، بلاک ۱ ساعته (Redis key: `otp:phone:ratelimit:{phone}`)

// POST /api/v1/auth/verify-phone-otp
// { phone, otpCode }
// با موفقیت: user.isPhoneVerified = true، user.phoneVerifyCode = undefined
```

**Validator جدید:** `backend/src/validators/authValidator.ts` — `sendPhoneOTPValidator`, `verifyPhoneOTPValidator`

---

#### ۳. کنترلر درخواست مدرس (Backend/Controllers)

**فایل جدید:** `backend/src/controllers/instructorApplicationController.ts`

```typescript
// POST /api/v1/instructor-applications
// submitApplication(req, res) — ایجاد درخواست، وضعیت pending
//   Body: personalInfo, professionalInfo
//   Auth: required (student یا instructor با isApproved:false)
//   Validation: nationalId یکتا، phone verified، کاربر قبلاً درخواست نداشته باشد

// GET /api/v1/instructor-applications/me
// getMyApplication(req, res) — درخواست کاربر جاری

// POST /api/v1/instructor-applications/:id/documents
// uploadDocument(req, res) — آپلود سند (proxyUpload + documentFilter)
//   Multipart: file, type (national_id|degree|certificate|work_proof|other)
//   ذخیره در S3: folder `instructor-applications/{applicationId}/`
//   ایجاد InstructorDocument، لینک به Application

// DELETE /api/v1/instructor-applications/:id/documents/:docId
// deleteDocument(req, res) — حذف سند (فقط در وضعیت pending/correction_requested)

// Admin Routes (prefix: /api/v1/admin/instructor-applications)
// GET / — listApplications (pagination, filter: status, search)
// GET /:id — getApplicationDetail (populate user, documents)
// PUT /:id/approve — approveApplication (body: adminNotes)
//   Atomic: findOneAndUpdate status=approved, reviewedBy, reviewedAt
//   Side-effects:
//     - user.role = 'instructor' (اگر student بود)
//     - user.instructorProfile.isApproved = true
//     - user.instructorProfile.approvalStatus = 'approved'
//     - createNotification + email to applicant
//     - Membership update (role: instructor)

// PUT /:id/reject — rejectApplication (body: adminNotes, reason)
//   status = rejected, notification + email

// PUT /:id/request-correction — requestCorrection (body: adminNotes, correctionFields: string[])
//   status = correction_requested, notification + email
```

**Middleware جدید:** `backend/src/middlewares/requireApprovedInstructor.ts`
```typescript
export const requireApprovedInstructor = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
    return next(ApiError.forbidden('فقط مدرسین مجاز هستند'));
  }
  if (req.user.role === 'instructor' && !req.user.instructorProfile?.isApproved) {
    return next(ApiError.forbidden('حساب مدرس شما هنوز تأیید نشده است. لطفاً منتظر تأیید ادمین بمانید.'));
  }
  next();
};
```

**اعمال در `instructorRoutes.ts`:**
```typescript
router.use(authenticate, requireApprovedInstructor); // تمام مسیرهای /instructor/* بجز public profile
```

---

#### ۴. مسیرها (Backend/Routes)

**فایل جدید:** `backend/src/routes/instructorApplicationRoutes.ts`
```typescript
router.post('/', authenticate, validate(submitApplicationValidator), submitApplication);
router.get('/me', authenticate, getMyApplication);
router.post('/:id/documents', authenticate, uploadDocumentMiddleware.single('file'), uploadDocument);
router.delete('/:id/documents/:docId', authenticate, deleteDocument);
```

**فایل جدید:** `backend/src/routes/adminInstructorApplicationRoutes.ts`
```typescript
router.use(authenticate, adminOnly);
router.get('/', listApplications);
router.get('/:id', getApplicationDetail);
router.put('/:id/approve', validate(approveValidator), approveApplication);
router.put('/:id/reject', validate(rejectValidator), rejectApplication);
router.put('/:id/request-correction', validate(correctionValidator), requestCorrection);
```

**ثبت در `index.ts`:**
```typescript
router.use(`${apiVersion}/instructor-applications`, instructorApplicationRoutes);
router.use(`${apiVersion}/admin/instructor-applications`, adminInstructorApplicationRoutes);
```

---

#### ۵. ذخیره‌سازی امن اسناد (Backend/Storage)

**تغییر در `storageService.ts` / `config/storage.ts`:**
- Bucket جداگانه: `S3_BUCKET_INSTRUCTOR_DOCS` (Private ACL)
- Folder pattern: `instructor-applications/{applicationId}/{timestamp}_{uuid}_{sanitizedFileName}`
- متد موجود `getSignedDownloadUrl(key, originalName, 600)` برای دانلود ادمین (۱۰ دقیقه انقضا)

**تقویت `upload.ts`:**
- `documentFilter`: اعتبارسنجی MIME type واقعی (magic bytes) + Extension
- محدودیت حجم: ۱۰MB برای اسناد مدرس
- لاگ امنیتی: `console.log('[SECURITY] Document upload', { userId, fileName, mimeType, size })`

---

#### ۶. اعلان‌ها و ایمیل‌ها (Backend/Notifications)

**استفاده از `createNotification()` موجود:**
```typescript
// در approveApplication:
await createNotification({
  recipient: application.user,
  sender: adminUser._id,
  type: 'instructor_application_approved',
  title: 'درخواست مدرس شما تأیید شد 🎉',
  message: 'اکنون به داشبورد مدرس دسترسی دارید و می‌توانید دوره بسازید.',
  link: '/instructor/dashboard'
});

// در rejectApplication:
await createNotification({ type: 'instructor_application_rejected', title: 'درخواست مدرس رد شد', message: adminNotes, link: '/instructor/apply' });

// در requestCorrection:
await createNotification({ type: 'instructor_application_correction', title: 'تصحیح درخواست مدرس', message: adminNotes, link: '/instructor/apply' });
```

**템پلیت‌های ایمیل جدید در `emailTemplates.ts`:**
- `applicationSubmittedTemplate(name)`
- `applicationApprovedTemplate(name, dashboardUrl)`
- `applicationRejectedTemplate(name, reason, reapplyUrl)`
- `applicationCorrectionRequestedTemplate(name, corrections, reapplyUrl)`

---

#### ۷. فرانت‌اند — سرویس و تایپ‌ها

**فایل جدید:** `frontend/src/app/core/models/instructor-application.model.ts`
```typescript
export interface InstructorApplication {
  _id: string;
  user: string;
  personalInfo: PersonalInfo;
  phoneVerification: PhoneVerification;
  professionalInfo: ProfessionalInfo;
  documents: InstructorDocument[];
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'correction_requested';
  adminNotes: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface PersonalInfo {
  fullName: string;
  nationalId: string;
  dateOfBirth: string; // ISO
  gender: 'male' | 'female';
  email: string;
  phone: string;
  avatar?: string;
}

export interface PhoneVerification {
  verified: boolean;
  verifiedAt?: string;
}

export interface ProfessionalInfo {
  mainSpecialty: string;
  additionalSpecialties: string[];
  education: EducationItem[];
  workExperience: WorkExperienceItem[];
  achievements: string;
}

export interface EducationItem {
  institution: string;
  fieldOfStudy: string;
  degree: 'diploma' | 'associate' | 'bachelor' | 'master' | 'phd' | 'other';
  documentId?: string;
}

export interface WorkExperienceItem {
  organization: string;
  position: string;
  description: string;
  documentId?: string;
}

export interface InstructorDocument {
  _id: string;
  type: 'national_id' | 'degree' | 'certificate' | 'work_proof' | 'other';
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  uploadedAt: string;
}
```

**فایل جدید:** `frontend/src/app/core/services/instructor-application.service.ts`
```typescript
@Injectable({ providedIn: 'root' })
export class InstructorApplicationService {
  private api = inject(ApiService);
  
  submitApplication(data: Partial<InstructorApplication>): Observable<ApiResponse<InstructorApplication>>;
  getMyApplication(): Observable<ApiResponse<InstructorApplication>>;
  uploadDocument(applicationId: string, file: File, type: DocumentType): Observable<ApiResponse<InstructorDocument>>;
  deleteDocument(applicationId: string, docId: string): Observable<ApiResponse<null>>;
  
  // Admin
  getAllApplications(params: PaginationParams): Observable<ApiResponse<InstructorApplication[]>>;
  getApplicationDetail(id: string): Observable<ApiResponse<InstructorApplication>>;
  approveApplication(id: string, notes: string): Observable<ApiResponse<InstructorApplication>>;
  rejectApplication(id: string, notes: string): Observable<ApiResponse<InstructorApplication>>;
  requestCorrection(id: string, notes: string, fields: string[]): Observable<ApiResponse<InstructorApplication>>;
}
```

---

#### ۸. فرانت‌اند — صفحه ثبت‌نام مدرس (Multi-step Form)

**مسیر:** `/instructor/apply` (محافظت شده با `authGuard`، فقط `student` یا `instructor` با `!isApproved`)

**ساختار پوشه:** `frontend/src/app/features/instructor/apply/`
```
apply/
├── apply.component.ts          // Container اصلی، مدیریت مرحله
├── apply.routes.ts             // Lazy-loaded route
├── steps/
│   ├── step1-personal/         // اطلاعات شخصی + کد ملی + آواتار
│   ├── step2-phone/            // تلفن + OTP SMS
│   ├── step3-professional/     // تخصص، سوابق تحصیلی/شغلی (Dynamic FormArray)
│   └── step4-documents/        // آپلود اسناد (DocumentUploader)
├── components/
│   ├── document-uploader/      // Drag-drop، پیش‌نمایش، حذف، نوار پیشرفت
│   ├── education-form/         // FormArray برای سوابق تحصیلی
│   ├── experience-form/        // FormArray برای سوابق شغلی
│   └── step-indicator/         // نوار پیشرفت مراحل
└── apply.service.ts            // State مدیریت فرم بین مراحل (Signal-based)
```

**الگو از `register.component.ts`:**
- `currentStep = signal<1|2|3|4>(1)`
- هر مرحله: FormGroup جداگانه، اعتبارسنجی کامل قبل از رفتن به مرحله بعد
- ذخیره موقت در `localStorage` (key: `instructor_apply_draft:{userId}`) برای بازیابی در صورت رفرش
- دکمه "قبلی" و "بعدی"، ارسال نهایی در مرحله ۴

**کامپوننت `DocumentUploaderComponent` (الگو از `video-uploader.component.ts`):**
```typescript
// Input: applicationId, acceptedTypes, maxFiles, maxSizePerFile
// Features:
// - Drag & drop zone
// - پیش‌نمایش thumbnail (PDF → آیکون، Image → thumbnail)
// - نوار پیشرفت آپلود (HttpEventType.UploadProgress)
// - دکمه حذف (قبل از ارسال نهایی)
// - لیست فایل‌های آپلود شده با نوع سند (Radio/Select برای type)
```

---

#### ۹. فرنت‌اند — پنل ادمین مدیریت درخواست‌ها

**مسیر:** `/admin/instructor-applications` (محافظت شده با `authGuard` + `roleGuard(['admin'])`)

**ساختار پوشه:** `frontend/src/app/features/admin/instructor-applications/`
```
instructor-applications/
├── applications-list/
│   ├── applications-list.component.ts    // جدول + فیلتر + صفحه‌بندی
│   └── applications-list.component.html
├── application-detail/
│   ├── application-detail.component.ts   // جزئیات کامل + پیش‌نمایش اسناد
│   └── application-detail.component.html
├── action-modal/
│   └── action-modal.component.ts         // Modal تأیید/رد/تصحیح با فرم دلیل
└── instructor-applications.routes.ts
```

**الگو از `admin-users.component.ts`:**
- `users` → `applications` signal
- فیلترها: `statusFilter` (pending/under_review/approved/rejected/correction_requested), `searchQuery`, `dateRange`
- `PaginationComponent` موجود
- `JalaliDatePipe` برای تاریخ‌ها
- `ImageFallbackDirective` برای آواتار متقاضی

**صفحه جزئیات (`application-detail`):**
- دو ستون: اطلاعات شخصی/حرفه‌ای (Read-only) | اسناد (Grid با پیش‌نمایش)
- پیش‌نمایش PDF: `iframe` با `serveFile` endpoint یا `pdf.js`
- پیش‌نمایش تصویر: `ImageViewerComponent` موجود
- دانلود امن: دکمه که `storageService.getSignedDownloadUrl` صدا می‌زند (یا مستقیم از `document.downloadUrl` اگر از قبل signed است)
- دکمه‌های اکشن: "تأیید"، "رد"، "درخواست تصحیح" → باز کردن `ActionModalComponent`

**`ActionModalComponent` (الگو از `ConfirmModalComponent` + `QuickTicketDialogComponent`):**
- Radio: نوع اکشن (تأیید/رد/تصحیح)
- Textarea: دلیل/یادداشت ادمین (الزامی برای رد/تصحیح)
- برای تصحیح: Checkbox لیست فیلدهای نیاز به تصحیح (Dynamic از داده‌های درخواست)
- Submit → فراخوانی API مربوطه → Toast موفقیت → Refresh لیست

---

#### ۱۰. امنیت و سخت‌سازی

**فایل جدید:** `backend/src/utils/encryption.ts`
```typescript
// AES-256-GCM برای رمزنگاری کد ملی
const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes
const IV_LENGTH = 12;

export function encrypt(text: string): { encrypted: string; iv: string; authTag: string } { ... }
export function decrypt(encrypted: string, iv: string, authTag: string): string { ... }
```

**استفاده در `InstructorApplication` model:**
```typescript
// Pre-save hook: nationalId رمزنگاری شود
// Virtual getter: decrypt برای ادمین (فقط در getApplicationDetail)
```

**Middleware لاگ‌گذاری امن:** `backend/src/middlewares/sanitizeLogs.middleware.ts`
```typescript
// Intercept console.log در کنترلرهای حساس
// حذف/ماسک کردن: nationalId, otpCode, password, token, creditCard
```

**اسکن ویروس (اختیاری اما توصیه شده):**
- `clamav.js` یا `node-clamd` در `proxyUpload` middleware
- Async، non-blocking (فایل در quarantine تا تأیید)

---

#### ۱۱. تست‌ها

**بک‌اند:** `backend/src/__tests__/instructorApplication.test.ts`
```typescript
describe('Instructor Application Flow', () => {
  it('should submit application with valid data', async () => { ... });
  it('should reject duplicate nationalId', async () => { ... });
  it('should require phone verification before submit', async () => { ... });
  it('should upload documents and link to application', async () => { ... });
  it('should approve application and activate instructor role', async () => { ... });
  it('should reject application with notification', async () => { ... });
  it('should request correction and notify applicant', async () => { ... });
  it('should not allow unapproved instructor to access /instructor/* routes', async () => { ... });
});
```

**فرانت‌اند:** `frontend/src/app/features/instructor/apply/*.spec.ts`
- تست FormArray پویا (افزودن/حذف سوابق)
- تست آپلود فایل (Mock HttpClient)
- تست ناوبری مراحل (Guardها، اعتبارسنجی)

---

#### ۱۲. معیارهای پذیرش (Acceptance Criteria)

| سناریو | معیار پذیرش |
|---------|-------------|
| **ثبت‌نام مدرس جدید** | کاربر Student می‌تواند `/instructor/apply` را ببیند، ۴ مرحله را تکمیل کند، درخواست با وضعیت `pending` ثبت شود |
| **تأیید تلفن** | OTP SMS ارسال/تأیید شود، Rate-limit کار کند، `isPhoneVerified` در User true شود |
| **آپلود اسناد** | چند فایل PDF/تصویر آپلود شود، در S3 Private ذخیره شود، پیش‌نمایش در فرانت کار کند |
| **مشاهده ادمین** | ادمین در `/admin/instructor-applications` لیست را ببیند، فیلتر/جستجو کار کند |
| **تأیید ادمین** | ادمین با کلیک "تأیید" → کاربر نقش `instructor` بگیرد، `isApproved=true`، اعلان+ایمیل ارسال شود، داشبورد مدرس قابل دسترسی شود |
| **رد ادمین** | ادمین با دلیل رد کند → وضعیت `rejected`، اعلان+ایمیل، کاربر می‌تواند مجدداً درخواست دهد |
| **درخواست تصحیح** | ادمین فیلدهای مشخص را علامت بزند → وضعیت `correction_requested`، کاربر در `/instructor/apply` فیلدهای مشخص را ببیند و ویرایش کند |
| **دسترسی کنترل** | کاربر با `isApproved:false` نمی‌تواند `/instructor/dashboard`، `/instructor/course-builder` را ببیند (۴۰۳) |
| **امنیت اسناد** | دانلود اسناد فقط با Signed URL (۱۰ دقیقه)، مستقیم در مرورگر باز نشود (Content-Disposition: attachment) |
| **بدون رگرسیون** | تمام تست‌های موجود Pass کنند، کاربران موجود مدرس بدون تأثیر بمانند |

---

#### ۱۳. ترتیب اجرا و وابستگی‌ها

```
فاز ۱ (DB/Models) ──────────────────┐
فاز ۲ (OTP SMS) ────────────────────┤
فاز ۳ (Controller) ◄────────────────┤
فاز ۵ (Storage) ────────────────────┼──► فاز ۴ (Routes/Notifications)
فاز ۶ (Frontend Apply) ◄────────────┘
فاز ۷ (Frontend Admin) ◄────────────┘
فاز ۸ (Security) ───────────────────┘
فاز ۹ (Tests/Docs) ─────────────────┘
```

**تخمین زمان:** ۵ هفته (۲ توسعه‌دهنده بک‌اند، ۱ فرانت‌اند، ۱ DevOps/QA)

---

#### ۱۴. نکات مهم برای Agent پیاده‌سازی

1. **هرگز فایل‌های موجود را بازنویسی نکنید** — فقط گسترش دهید (Extend)
2. **از الگوهای موجود پیروی کنید** — `register.component.ts` برای فرم، `admin-users.component.ts` برای لیست ادمین، `proxyUpload` برای آپلود
3. **سازگاری عقب** — `instructorProfile.isApproved` Boolean باقی بماند، Middleware جدید اضافه شود بدون تغییر کنترلرهای موجود
4. **امنیت اول** — کد ملی رمزنگاری، OTP هش، Signed URL، Rate-limit سخت
5. **تست در هر فاز** — تست واحد همزمان با کد، تست یکپارچه در پایان
6. **مستندسازی Swagger** — Decoratorهای `@ApiOperation`, `@ApiBody`, `@ApiResponse` در کنترلرهای جدید

---

**پایان پرامپت پیاده‌سازی** — این پرامپت حاوی تمام جزئیات فنی برای آغاز کدنویسی است بدون نیاز به بررسی مجدد معماری.