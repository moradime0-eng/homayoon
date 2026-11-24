# پیش‌نویس ذخیره‌شده یافت شد - توضیح کامل

## 📋 خلاصه پیام

پیام **«پیش‌نویس ذخیره‌شده یافت شد. یک پیش‌نویس از جلسه قبل وجود دارد. آیا می‌خواهید آن را بازیابی کنید؟»** در **Course Builder (سازنده دوره)** نمایش داده می‌شود وقتی کاربر به صفحه ویرایش/ایجاد دوره برمی‌گردد و داده‌های ذخیره‌شده‌ی قبلی در مرورگر وجود دارد.

---

## 🎯 هدف و عملکرد

این سیستم **Auto-save (ذخیره خودکار)** و **Draft Recovery (بازیابی پیش‌نویس)** برای جلوگیری از از دست رفتن داده‌های کاربر در صورت:
- بستن ناگهانی مرورگر/تب
- قطع اتصال اینترنت
- رفرش صفحه به اشتباه
- کرش کردن برنامه

---

## 📍 مکان پیاده‌سازی

### فایل‌های اصلی:
| فایل | مسیر | توضیح |
|------|------|-------|
| **Component Logic** | `frontend/src/app/features/instructor/course-builder/course-builder.component.ts` | منطق اصلی ذخیره/بازیابی |
| **Template (UI)** | `frontend/src/app/features/instructor/course-builder/course-builder.component.html` | بنر نمایش پیام بازیابی |
| **Styles** | `frontend/src/app/features/instructor/course-builder/course-builder.component.scss` | استایل بنر بازیابی |

---

## ⚙️ نحوه عملکرد - فرآیند کامل

### 1. **مفتاح ذخیره‌سازی (Draft Key Generation)**
```typescript
// در ngOnInit()
const userId = this.authService.currentUser()?._id;
this.draftKey = userId ? `course_builder_draft:${userId}:${id || 'new'}` : null;
```
- **منحصر به فرد برای هر کاربر** - پیش‌نویس‌ها بین کاربران اشتراک‌گذاری نمی‌شوند
- **منحصر به فرد برای هر دوره** - `id` برای ویرایش، `'new'` برای ایجاد جدید
- فرمت: `course_builder_draft:{userId}:{courseId}`

### 2. **ذخیره خودکار (Auto-save) - دو لایه**

#### الف) **LocalStorage (لایه سریع - کلاینت‌ساید)**
```typescript
// ذخیره با دیبانس ۵۰۰ میلی‌ثانیه
private readonly AUTOSAVE_DEBOUNCE_MS = 500;

setupAutosave() {
  forms.forEach(form => form.valueChanges.subscribe(() => {
    if (this.hydratingCourse || this.showRecoveryBanner()) return;
    this.hasUnsavedChanges.set(true);
    clearTimeout(this.autosaveDebounceTimer);
    this.autosaveDebounceTimer = setTimeout(() => this.saveDraftToLocalStorage(), this.AUTOSAVE_DEBOUNCE_MS);
  }));
}

private saveDraftToLocalStorage(): void {
  const draft = {
    basicForm: this.basicForm?.getRawValue(),
    mediaForm: this.mediaForm?.getRawValue(),
    curriculumForm: this.curriculumForm?.getRawValue(),
    pricingForm: this.pricingForm?.getRawValue(),
    seoForm: this.seoForm?.getRawValue(),
    courseId: this.courseId(),
    isEditMode: this.isEditMode,
    timestamp: Date.now(),  // برای بررسی اعتبار (۲۴ ساعت)
  };
  localStorage.setItem(this.draftKey, JSON.stringify(draft));
}
```

#### ب) **Server Auto-save (لایه دائمی - سرور)**
```typescript
// هر ۳۰ ثانیه در حالت ویرایش
this.autosaveInterval = setInterval(() => {
  if (this.hasUnsavedChanges() && this.isEditMode && this.courseId() && ...) {
    this.autoSave();  // ارسال به API
  }
}, 30000);
```

#### ج) **Page Hide Persistence**
```typescript
@HostListener('window:pagehide')
persistDraftOnPageHide(): void {
  if (this.hasUnsavedChanges() && !this.showRecoveryBanner()) 
    this.saveDraftToLocalStorage();
}
```

### 3. **بررسی پیش‌نویس موجود (Check for Draft Recovery)**
```typescript
// در setupAutosave() فراخوانی می‌شود
private checkForDraftRecovery(): void {
  if (!this.isBrowser() || !this.draftKey) return;

  try {
    const saved = localStorage.getItem(this.draftKey);
    if (saved) {
      const draft = JSON.parse(saved);
      
      // بررسی اعتبار: کمتر از ۲۴ ساعت و دارای محتوا
      const isRecent = Date.now() - draft.timestamp < 24 * 60 * 60 * 1000;
      const hasContent = !!draft.basicForm || !!draft.curriculumForm;
      
      // نمایش بنر اگر: اخیر باشد + محتوا داشته باشد + مربوط به همین دوره باشد
      if (isRecent && hasContent && (!this.isEditMode || draft.courseId === this.courseId())) {
        this.showRecoveryBanner.set(true);
      }
    }
  } catch (e) {
    console.warn('Failed to check for draft recovery:', e);
  }
}
```

### 4. **بازیابی پیش‌نویس (Recover Draft)**
```typescript
recoverDraft(): void {
  if (!this.isBrowser() || !this.draftKey) return;

  try {
    const saved = localStorage.getItem(this.draftKey);
    if (saved) {
      const draft = JSON.parse(saved);
      this.restoredDraft = true;
      
      // بازیابی FormArrayها (نیاز به rebuild دارند)
      const restoreArray = (array: FormArray, values: any[]) => {
        array.clear({ emitEvent: false });
        (values || []).forEach(value => array.push(this.fb.control(value), { emitEvent: false }));
      };
      
      // بازیابی آرایه‌های ساده
      for (const name of ['tags', 'requirements', 'learningOutcomes', 'targetAudience']) {
        restoreArray(this.basicForm.get(name) as FormArray, draft.basicForm?.[name]);
      }
      restoreArray(this.keywords, draft.seoForm?.keywords);
      
      // بازیابی Sections و Lectures (تو در تو)
      this.sections.clear({ emitEvent: false });
      for (const section of draft.curriculumForm?.sections || []) {
        const lectures = this.fb.array<FormGroup>([]);
        for (const lecture of section.lectures || []) {
          const items = this.fb.array<FormGroup>([]);
          for (const item of lecture.contentItems || []) {
            // بازیابی content items
          }
          // بازیابی lecture
        }
        // بازیابی section
      }
      
      // بازیابی فرم‌های ساده
      this.basicForm.patchValue(draft.basicForm, { emitEvent: false });
      this.mediaForm.patchValue(draft.mediaForm, { emitEvent: false });
      this.pricingForm.patchValue(draft.pricingForm, { emitEvent: false });
      this.seoForm.patchValue(draft.seoForm, { emitEvent: false });
      
      this.showRecoveryBanner.set(false);
      this.hasUnsavedChanges.set(true);
    }
  } catch (e) {
    console.error('Failed to recover draft:', e);
  }
}
```

### 5. **نادیده گرفتن (Dismiss Recovery)**
```typescript
dismissRecovery(): void {
  this.showRecoveryBanner.set(false);
  this.clearLocalStorageDraft();
}

private clearLocalStorageDraft(): void {
  if (!this.isBrowser()) return;
  if (this.draftKey) localStorage.removeItem(this.draftKey);
  this.hasUnsavedChanges.set(false);
}
```

---

## 🖥️ UI - بنر بازیابی

### HTML Template:
```html
<!-- 🔄 بنر بازیابی پیش‌نویس -->
<div class="banner-wrap" *ngIf="showRecoveryBanner()">
  <div class="recovery-banner" @slideIn>
    <div class="recovery-banner-icon">
      <mat-icon>restore</mat-icon>
    </div>
    <div class="recovery-banner-content">
      <h3>پیش‌نویس ذخیره‌شده یافت شد</h3>
      <p>یک پیش‌نویس از جلسه قبل وجود دارد. آیا می‌خواهید آن را بازیابی کنید؟</p>
    </div>
    <div class="recovery-banner-actions">
      <button class="btn btn-primary" (click)="recoverDraft()">
        <mat-icon>restore</mat-icon>
        بازیابی پیش‌نویس
      </button>
      <button class="btn btn-secondary" (click)="dismissRecovery()">
        <mat-icon>delete</mat-icon>
        نادیده بگیر
      </button>
    </div>
  </div>
</div>
```

### انیمیشن (slideIn):
```typescript
trigger('slideIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(-50%) scale(0.95)' }),
    animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', 
      style({ opacity: 1, transform: 'translateX(-50%) scale(1)' }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', 
      style({ opacity: 0, transform: 'translateX(-50%) scale(0.95)' }))
  ]),
])
```

---

## 🔄 جریان کامل فرآیند (Flow Diagram)

```mermaid
flowchart TD
    A[User opens Course Builder] --> B{isBrowser?}
    B -->|Yes| C[Generate draftKey]
    C --> D[Init Forms]
    D --> E[Setup Autosave]
    E --> F[checkForDraftRecovery]
    F --> G{localStorage has draft?}
    G -->|Yes| H{Recent < 24h & Has Content?}
    H -->|Yes| I[showRecoveryBanner = true]
    H -->|No| J[Ignore/Delete old draft]
    G -->|No| K[No banner shown]
    I --> L[User sees banner]
    L --> M{User Action}
    M -->|Recover| N[recoverDraft()]
    M -->|Dismiss| O[dismissRecovery()]
    N --> P[Parse & Restore all Forms]
    P --> Q[showRecoveryBanner = false]
    Q --> R[hasUnsavedChanges = true]
    O --> S[Clear localStorage]
    S --> T[hasUnsavedChanges = false]
    
    %% Auto-save loop
    U[Form Value Changes] --> V[Debounce 500ms]
    V --> W[saveDraftToLocalStorage]
    W --> X[Update localStorage]
    
    %% Periodic server save
    Y[30s Interval] --> Z{Edit Mode & Has Changes?}
    Z -->|Yes| AA[autoSave to Server]
    
    %% Page unload
    AB[Page Hide] --> AC[Persist to localStorage]
```

---

## ⏱️ زمان‌بندی و تنظیمات

| تنظیم | مقدار | توضیح |
|--------|--------|-------|
| **Debounce LocalStorage** | 500ms | تأخیر قبل از ذخیره در localStorage |
| **Server Auto-save Interval** | 30 ثانیه | ارسال دوره‌ای به سرور (فقط ویرایش) |
| **Draft Expiry** | 24 ساعت | پیش‌نویس‌های قدیمی‌تر نمایش داده نمی‌شوند |
| **Storage Key Format** | `course_builder_draft:{userId}:{courseId}` | منحصر به فرد برای کاربر و دوره |

---

## 🛡️ امنیت و حریم خصوصی

1. **User Isolation**: هر کاربر فقط پیش‌نویس‌های خودش را می‌بیند
2. **Course Isolation**: پیش‌نویس دوره A در دوره B نمایش داده نمی‌شود
3. **Client-side Only**: localStorage فقط در مرورگر کاربر ذخیره می‌شود
4. **Auto-cleanup**: پیش‌نویس‌های قدیمی (>24h) نادیده گرفته می‌شوند
5. **No Sensitive Data**: فقط داده‌های فرم (بدون توکن/رمز) ذخیره می‌شود

---

## 🐛 عیب‌یابی رایج

### پیش‌نویس نمایش داده نمی‌شود:
- [ ] `isBrowser()` برگرداند `false` (SSR)
- [ ] `draftKey` null است (کاربر لاگین نیست)
- [ ] پیش‌نویس قدیمی‌تر از 24 ساعت است
- [ ] پیش‌نویس خالی است (بدون محتوا)
- [ ] `localStorage` غیرفعال/پر است

### بازیابی کار نمی‌کند:
- [ ] خطای JSON.parse (داده‌های خراب)
- [ ] FormArray rebuild ناموفق
- [ ] تضاد در ساختار فرم (مهاجرت نسخه)

### بنر تکرار می‌شود:
- [ ] `clearLocalStorageDraft()` فراخوانی نشده
- [ ] `hasUnsavedChanges` ریست نشده

---

## 📝 نکات مهم برای توسعه‌دهندگان

1. **FormArray Rebuild**: `patchValue` برای FormArray کار نمی‌کند، باید `clear()` و `push()` مجدد انجام شود
2. **emitEvent: false**: در بازیابی برای جلوگیری از trigger شدن autosave مجدد
3. **hydratingCourse Flag**: در حین لود دوره از سرور، autosave غیرفعال است
4. **restoredDraft Flag**: برای تشخیص حالت بازیابی در سایر بخش‌ها
5. **Type Safety**: `getRawValue()` شامل disabled controls هم می‌شود

---

## 🔗 فایل‌های مرتبط

```
frontend/src/app/features/instructor/course-builder/
├── course-builder.component.ts      # منطق اصلی (3767 خط)
├── course-builder.component.html    # قالب UI (شامل بنر بازیابی)
├── course-builder.component.scss    # استایل‌ها
└── course-builder.component.spec.ts # تست‌ها
```

---

*آخرین به‌روزرسانی: ۲۰۲۶-۱۱-۱۹*
*نسخه: 1.0*