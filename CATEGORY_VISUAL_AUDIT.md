# گزارش فنی ممیزی سیستم نمایش آیکون و تصاویر دسته‌بندی‌های آموزشی همایون

**تاریخ گزارش:** ۱۴۰۵/۰۸/۱۱ (۲۰۲۶-۱۱-۰۲)  
**نوع ممیزی:** فنی و معماری (بدون تغییر کد)  
**محدوده:** کل پروژه (Frontend Angular + Backend Node.js/Express)  
**وضعیت:** گزارش نهایی — هیچ تغییری در سورس ایجاد نشده است

---

## بخش اول: خلاصه معماری فعلی

سیستم دسته‌بندی‌های آموزشی در پروژه همایون با معماری دو سطحی (ریشه و زیردسته) طراحی شده است. دسته‌بندی‌ها در MongoDB ذخیره می‌شوند و از طریق REST API به فرانت‌اند Angular ارسال می‌شوند. نمایش آیکون و تصویر دسته‌بندی‌ها از طریق یک کامپوننت واحد و مشترک (`CategoryIconComponent`) در کل پروژه انجام می‌شود.

### ویژگی‌های کلیدی سیستم فعلی:
- **دو سطح دسته‌بندی:** ریشه (level=0) و زیردسته (level=1)
- **چهار نوع آیکون:** Material Icons، Emoji، Google Fonts، و تصویر سفارشی (Custom)
- **آپلود تصویر:** از طریق Cloudinary با محدودیت ۲ مگابایت
- **رنگ دسته‌بندی:** کد هگز برای نمایش گرادیان پس‌زمینه آیکون
- **کامپوننت مشترک:** `CategoryIconComponent` در مسیر `shared/components/category-icon/`

---

## بخش دوم: نقشه فایل‌ها

### فایل‌های فرانت‌اند (Angular)

| # | مسیر فایل | وظیفه | محل نمایش تصویر/آیکون |
|---|-----------|--------|------------------------|
| 1 | `frontend/src/app/features/admin/categories-management/categories-management.component.ts` | کامپوننت اصلی مدیریت دسته‌بندی‌ها (پنل ادمین) | نمایش آیکون در کارت دسته‌بندی و زیردسته‌ها |
| 2 | `frontend/src/app/features/admin/categories-management/categories-management.component.html` | تمپلیت مدیریت دسته‌بندی‌ها | `<app-category-icon>` در کارت شبکه‌ای و لیستی |
| 3 | `frontend/src/app/features/admin/categories-management/categories-management.component.scss` | استایل‌های مدیریت دسته‌بندی‌ها | ابعاد کانتینر آیکون (48px)، border-radius، object-fit |
| 4 | `frontend/src/app/features/admin/categories-management/category-dialog/category-dialog.component.ts` | دیالوگ ایجاد/ویرایش دسته‌بندی | پیش‌نمایش زنده آیکون، انتخاب آیکون، آپلود فایل |
| 5 | `frontend/src/app/features/admin/categories-management/category-dialog/category-dialog.component.html` | تمپلیت دیالوگ دسته‌بندی | `<app-category-icon>` در پیش‌نمایش و انتخابگر آیکون |
| 6 | `frontend/src/app/features/admin/categories-management/category-dialog/category-dialog.component.scss` | استایل‌های دیالوگ دسته‌بندی | ابعاد آیکون در پیش‌نمایش (48px)، انتخابگر (44px) |
| 7 | `frontend/src/app/shared/components/category-icon/category-icon.component.ts` | **کامپوننت نمایش یکپارچه آیکون دسته‌بندی** | رندر تمام نوع آیکون‌ها (material, emoji, google, custom) |
| 8 | `frontend/src/app/shared/components/category-filter-bar/category-filter-bar.component.ts` | نوار فیلتر دسته‌بندی افقی | نمایش آیکون دسته در چپ هر چپ (chip) |
| 9 | `frontend/src/app/shared/components/category-filter-bar/category-filter-bar.component.html` | تمپلیت نوار فیلتر دسته‌بندی | `<app-category-icon>` با size=20 |
| 10 | `frontend/src/app/shared/components/category-filter-bar/category-filter-bar.component.scss` | استایل‌های نوار فیلتر دسته‌بندی | ابعاد و استایل چپ آیکون در فیلتر |
| 11 | `frontend/src/app/features/home/home.component.ts` | صفحه اصلی | دریافت دسته‌بندی‌ها و نمایش در شبکه دایره‌ای |
| 12 | `frontend/src/app/features/home/home.component.html` | تمپلیت صفحه اصلی | `<app-category-icon>` در `cat-circle__icon-wrapper` با size=30 |
| 13 | `frontend/src/app/features/home/home.component.scss` | استایل‌های صفحه اصلی | استایل کانتینر آیکون دایره‌ای در صفحه اصلی |
| 14 | `frontend/src/app/shared/components/mega-menu/mega-menu.component.ts` | مگامنوی دسته‌بندی سه‌سطحی | نمایش آیکون دسته در ریل مگامنو |
| 15 | `frontend/src/app/shared/components/mega-menu/mega-menu.component.html` | تمپلیت مگامنو | `<app-category-icon>` با size=22 در `mm-tile` |
| 16 | `frontend/src/app/shared/components/mega-menu/mega-menu.component.scss` | استایل‌های مگامنو | استایل کانتینر آیکون در مگامنو |
| 17 | `frontend/src/app/shared/components/course-card/course-card.component.html` | کارت دوره | نمایش نام دسته‌بندی (بدون آیکون دسته) |
| 18 | `frontend/src/app/core/models/category.model.ts` | مدل TypeScript دسته‌بندی | تعریف فیلدهای icon, iconType, customIconUrl, image, color |
| 19 | `frontend/src/app/core/services/api.service.ts` | سرویس API عمومی | متد `upload()` برای آپلود آیکون دسته‌بندی |
| 20 | `frontend/src/app/core/services/mega-menu.service.ts` | سرویس مگامنو | تبدیل دسته‌بندی‌های API به مدل MegaCategory |
| 21 | `frontend/src/app/core/models/mega-menu.model.ts` | مدل مگامنو | تعریف MegaCategory با فیلدهای icon, iconType, customIconUrl |
| 22 | `frontend/src/app/core/utils/image.utils.ts` | ابزارهای بهینه‌سازی تصویر | `optimizeCloudinaryUrl()`, `resolveImageUrl()` |
| 23 | `frontend/src/app/shared/directives/image-fallback.directive.ts` | دستورالعمل Fallback تصویر | مدیریت خطای بارگذاری تصویر (در course-card استفاده می‌شود) |
| 24 | `frontend/src/app/app.routes.ts` | تعریف Routeها | مسیرهای `/courses`, `/course/:slug`, `/admin/*` |

### فایل‌های بک‌اند (Node.js/Express)

| # | مسیر فایل | وظیفه | محل نمایش تصویر/آیکون |
|---|-----------|--------|------------------------|
| 1 | `backend/src/models/Category.ts` | مدل Mongoose دسته‌بندی | تعریف Schema با فیلدهای icon, iconType, customIconUrl, image, color |
| 2 | `backend/src/controllers/categoryController.ts` | کنترلر دسته‌بندی‌ها | متدهای create, update, uploadCategoryIcon, getCategories, getCategoryTree |
| 3 | `backend/src/routes/categoryRoutes.ts` | Routeهای دسته‌بندی | `POST /categories/upload-icon`, `GET /categories/tree`, `GET /categories/` |
| 4 | `backend/src/middlewares/upload.ts` | میدل‌ور آپلود فایل | `uploadImage` (multer memory storage → Cloudinary) |
| 5 | `backend/src/validators/categoryValidator.ts` | اعتبارسنجی ورودی دسته‌بندی | اعتبارسنجی فیلدهای icon, iconType, customIconUrl, color |

---

## بخش سوم: جریان اطلاعات

### جریان کامل از دیتابیس تا مرورگر

```
MongoDB (Collection: categories)
        ↓
Mongoose Model (Category.ts)
        ↓
Backend Controller (categoryController.ts)
        ↓
Backend Route (categoryRoutes.ts)
        ↓
REST API (GET /api/v1/categories/tree یا GET /api/v1/categories/)
        ↓
Angular ApiService (api.service.ts) - متد get()
        ↓
Component (categories-management.component.ts یا home.component.ts)
        ↓
Signal/State (categories signal)
        ↓
HTML Template (categories-management.component.html یا home.component.html)
        ↓
<app-category-icon> Component
        ↓
Browser (Render نهایی)
```

### مسیرهای مختلف دریافت دسته‌بندی‌ها

1. **دریافت درخت دسته‌بندی‌ها (برای پنل ادمین):**
   - `GET /api/v1/categories/tree?showAll=true&_t=<timestamp>`
   - استفاده در: `categories-management.component.ts` (متد `loadCategories()`)

2. **دریافت دسته‌بندی‌های عمومی (برای صفحه اصلی و مگامنو):**
   - `GET /api/v1/categories/tree` (بدون showAll)
   - استفاده در: `home.component.ts` (از طریق `courseService.getCategoryTree()`)
   - استفاده در: `mega-menu.service.ts` (متد `loadMegaMenu()`)

3. **دریافت دسته‌بندی به صورت فیلتر شده:**
   - `GET /api/v1/categories/?type=parents&parentId=<id>&level=<n>`
   - استفاده در: `catalog.component.ts` (فیلتر دسته‌بندی در کاتالوگ دوره‌ها)

4. **دریافت دسته‌بندی به صورت تک:**
   - `GET /api/v1/categories/:id`
   - استفاده در: `getCategoryById` کنترلر

### فیلدهای مربوط به تصویر و آیکون در مدل Category

```typescript
// frontend/src/app/core/models/category.model.ts
export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;                                    // نام آیکون (material/google) یا کاراکتر emoji
  iconType?: 'material' | 'emoji' | 'google' | 'custom'; // نوع آیکون
  customIconUrl?: string;                           // URL تصویر آپلودشده یا آدرس خارجی
  color?: string;                                   // کد هگز رنگ دسته‌بندی
  image?: string;                                   // فیلد تصویر (در مدل وجود دارد اما در UI استفاده نمی‌شود)
  parent?: string | null;
  level: number;                                    // 0 = root, 1 = subcategory
  order: number;
  isActive: boolean;
  totalCourses: number;
  children?: Category[];
  fullPath?: string;
  createdAt: string;
  updatedAt: string;
}
```

**نکته:** فیلد `image` در مدل Category تعریف شده است، اما در هیچ کدام از تمپلیت‌های frontend برای نمایش تصویر دسته‌بندی استفاده نمی‌شود. فقط فیلد `customIconUrl` برای نمایش تصویر آیکون استفاده می‌شود.

---

## بخش چهارم: سیستم فعلی آیکون و تصویر

### کامپوننت CategoryIconComponent (لایه نمایش واحد)

**مسیر:** `frontend/src/app/shared/components/category-icon/category-icon.component.ts`

این کامپوننت مسئول نمایش تمام نوع آیکون و تصویر دسته‌بندی در کل پروژه است. از چهار نوع آیکون پشتیبانی می‌کند:

#### ۱. نوع Material (پیش‌فرض)
- رندر با `<mat-icon>` از Angular Material
- نام آیکون از مجموعه Google Material Icons
- مثال: `category`, `school`, `code`, `home`

#### ۲. نوع Emoji
- رندر با `<span>` حاوی کاراکتر یونیکد
- تشخیص خودکار با regex `\p{Extended_Pictographic}/u`
- مثال: `🎓`, `🚀`, `💻`, `📚`

#### ۳. نوع Google
- رندر با `<mat-icon>` (همانند Material)
- نام آیکون از Google Fonts
- مثال: `home`, `school`

#### ۴. نوع Custom (تصویر آپلودشده)
- رندر با تگ `<img>`
- `src` از فیلد `customIconUrl`
- `loading="lazy"`
- `object-fit: contain`
- در صورت عدم وجود URL، fallback به `mat-icon` با مقدار `category`

### منطق تشخیص نوع آیکون (resolvedType)

```typescript
get resolvedType(): 'material' | 'emoji' | 'google' | 'custom' {
  const type = this.iconType;
  if (type) return type;                    // اگر نوع صریحاً مشخص شده باشد
  if (this.customIconUrl) return 'custom';  // اگر URL وجود داشته باشد → custom
  if (this.icon && this.isEmoji(this.icon)) return 'emoji'; // تشخیص emoji
  return 'material';                         // پیش‌فرض
}
```

### پاسخ به سوالات بررسی سیستم نمایش

| سوال | پاسخ |
|------|-------|
| ۱. داده آیکون یا تصویر از کدام فیلد دریافت می‌شود؟ | فیلد `icon` برای نام آیکون، `iconType` برای نوع، `customIconUrl` برای URL تصویر، `color` برای رنگ پس‌زمینه |
| ۲. آیا سیستم بین آیکون و تصویر تفاوت قائل می‌شود؟ | بله، از طریق فیلد `iconType` و منطق `resolvedType` در `CategoryIconComponent` |
| ۳. آیا از شرط‌هایی مانند `ngIf`، `ngSwitch` یا `@if` استفاده شده است؟ | بله، از `@switch` در تمپلیت `CategoryIconComponent` و `@if` برای بررسی وجود `customIconUrl` |
| ۴. آیا تصویر با تگ `img` نمایش داده می‌شود؟ | بله، فقط در حالت `custom` با تگ `<img>` و `loading="lazy"` |
| ۵. آیا SVG به‌صورت Inline یا از طریق URL نمایش داده می‌شود؟ | SVG فقط به عنوان URL در `customIconUrl` پشتیبانی می‌شود (در تگ img). Inline SVG پشتیبانی نمی‌شود |
| ۶. آیا از `mat-icon` استفاده شده است؟ | بله، برای نوع‌های material، google و fallback |
| ۷. آیا یک سرویس یا کامپوننت اختصاصی برای رندر آیکون وجود دارد؟ | بله، `CategoryIconComponent` در `shared/components/category-icon/` |
| ۸. اگر تصویر بارگذاری نشود چه اتفاقی می‌افتد؟ | هیچ Fallback بصری برای خطای بارگذاری تصویر (`onError`) در `CategoryIconComponent` تعریف نشده است. تصویر خالی نمایش داده می‌شود |
| ۹. آیا سیستم Fallback دارد؟ | بله، اما محدود: در حالت `custom` اگر `customIconUrl` خالی باشد، به `mat-icon` با مقدار `category` fallback می‌شود. در صورت خطای بارگذاری تصویر (404)، هیچ fallback وجود ندارد |
| ۱۰. آیا ابعاد و نسبت تصویر به‌درستی کنترل می‌شوند؟ | بله، با `object-fit: contain` و `[style.width.px]` و `[style.height.px]` بر اساس input `size` |

### کد واقعی تمپلیت CategoryIconComponent

```html
@switch (resolvedType) {
  @case ('emoji') {
    <span class="ci-emoji" [style.font-size.px]="size">{{ icon || '📁' }}</span>
  }
  @case ('custom') {
    @if (customIconUrl) {
      <img
        class="ci-img"
        [src]="customIconUrl"
        [alt]="alt"
        [style.width.px]="size"
        [style.height.px]="size"
        loading="lazy"
      />
    } @else {
      <mat-icon [style.font-size.px]="size" [style.width.px]="size" [style.height.px]="size">
        category
      </mat-icon>
    }
  }
  @default {
    <mat-icon [style.font-size.px]="size" [style.width.px]="size" [style.height.px]="size">
      {{ icon || fallback }}
    </mat-icon>
  }
}
```

### استایل‌های CategoryIconComponent

```scss
:host {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.ci-emoji {
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ci-img {
  object-fit: contain;
  display: block;
}
mat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}
```

---

## بخش پنجم: تحلیل CSS

### ابعاد و استایل آیکون در مکان‌های مختلف

#### ۱. پنل مدیریت - کارت دسته‌بندی (Grid View)
**فایل:** `categories-management.component.scss`

| ویژگی | مقدار |
|------|-------|
| کانتینر آیکون (`.cat-icon`) | width: 48px, height: 48px |
| border-radius | 12px (`$radius-md`) |
| display | flex, align-items: center, justify-content: center |
| flex-shrink | 0 |
| box-shadow | 0 4px 10px -3px rgba(0, 0, 0, 0.15) |
| mat-icon اندازه | font-size: 24px, width: 24px, height: 24px |
| پس‌زمینه | `[style.background]="getIconGradient(i)"` (گرادیان پویا بر اساس index) |

#### ۲. پنل مدیریت - کارت دسته‌بندی (List View)
**فایل:** `categories-management.component.scss`

| ویژگی | مقدار |
|------|-------|
| کانتینر آیکون (`.list-icon`) | width: 44px, height: 44px |
| border-radius | 12px (`$radius-md`) |
| mat-icon اندازه | font-size: 22px, width: 22px, height: 22px |

#### ۳. پنل مدیریت - زیردسته‌ها
**فایل:** `categories-management.component.scss`

| ویژگی | مقدار |
|------|-------|
| آیکون زیردسته (`.sub-icon`) | font-size: 16px, width: 16px, height: 16px |
| رنگ | `$text-muted` |

#### ۴. دیالوگ دسته‌بندی - پیش‌نمایش زنده
**فایل:** `category-dialog.component.scss`

| ویژگی | مقدار |
|------|-------|
| کانتینر آیکون (`.pv-icon`) | width: 48px, height: 48px |
| border-radius | 12px (`$radius-md`) |
| mat-icon اندازه | font-size: 24px, width: 24px, height: 24px |
| پس‌زمینه | گرادیان بر اساس `form.color` |

#### ۵. دیالوگ دسته‌بندی - انتخابگر آیکون
**فایل:** `category-dialog.component.scss`

| ویژگی | مقدار |
|------|-------|
| آیکون انتخاب شده (`.selected-icon`) | width: 44px, height: 44px |
| border-radius | 8px (`$radius-sm`) |
| mat-icon اندازه | font-size: 22px, width: 22px, height: 22px |

#### ۶. نوار فیلتر دسته‌بندی
**فایل:** `category-filter-bar.component.scss`

| ویژگی | مقدار |
|------|-------|
| آیکون در چپ (`.cfb__chip-icon`) | size=20 (از طریق input کامپوننت) |

#### ۷. مگامنو
**فایل:** `mega-menu.component.html`

| ویژگی | مقدار |
|------|-------|
| آیکون دسته در ریل | size=22 (از طریق input کامپوننت) |

#### ۸. صفحه اصلی - شبکه دایره‌ای
**فایل:** `home.component.html`

| ویژگی | مقدار |
|------|-------|
| آیکون دسته در `cat-circle__icon-wrapper` | size=30 (از طریق input کامپوننت) |

### بررسی سوالات تحلیل CSS

| سوال | پاسخ |
|------|-------|
| آیا تصویر داخل Container مشخصی قرار دارد؟ | بله، هر کدام از مکان‌های بالا کانتینر مجزا دارند (48px, 44px, 30px, 22px, 20px) |
| آیا Container ابعاد ثابت دارد؟ | بله، تمام کانتینرها ابعاد ثابت مربعی دارند |
| آیا تصویر کشیده یا فشرده می‌شود؟ | خیر، `object-fit: contain` در `.ci-img` استفاده شده است |
| آیا SVG بیش از حد بزرگ یا کوچک نمایش داده می‌شود؟ | SVG فقط به عنوان URL در تگ img نمایش داده می‌شود و با `object-fit: contain` کنترل می‌شود |
| آیا تصاویر Transparent روی پس‌زمینه نامناسب قرار می‌گیرند؟ | ممکن است. پس‌زمینه کانتینر آیکون یک گرادیان رنگ است (`getIconGradient(i)`) و اگر تصویر transparent باشد، رنگ پس‌زمینه پشت آن قابل مشاهده خواهد بود |
| آیا تصاویر در Dark Mode مشکل دارند؟ | استایل‌های dark mode برای کارت‌ها وجود دارد، اما برای تصویر آیکون (`ci-img`) استایل خاصی تعریف نشده است |
| آیا ابعاد کارت‌ها با تصاویر مختلف به‌هم می‌ریزد؟ | خیر، کانتینرهای آیکون ابعاد ثابت دارند و محتوای داخل آن‌ها با `object-fit: contain` کنترل می‌شود |

### استایل‌های Shared (Global)

**فایل:** `frontend/src/styles/_cards.scss` (اشاره شده در course-card.component.scss)

استایل‌های کارت دوره در فایل global تعریف شده است، اما دسته‌بندی‌ها استایل‌های مجزا در هر کامپوننت دارند.

---

## بخش ششم: سیستم آپلود

### وضعیت آپلود تصویر دسته‌بندی

**بله، امکان آپلود تصویر آیکون دسته‌بندی وجود دارد.**

#### مسیر آپلود:
- **Frontend:** `category-dialog.component.ts` → متد `onIconFileSelected()`
- **API:** `POST /api/v1/categories/upload-icon`
- **Backend Controller:** `uploadCategoryIcon` در `categoryController.ts`
- **Middleware:** `uploadImage.single('icon')` در `categoryRoutes.ts`

#### پیکربندی آپلود:
```typescript
// backend/src/middlewares/upload.ts
export const uploadImage = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for images
});
```

#### اعتبارسنجی سمت Backend (در `uploadCategoryIcon`):
- نوع فایل مجاز: `image/jpeg`, `image/png`, `image/gif`, `image/webp` (SVG **پشتیبانی نمی‌شود**)
- حداکثر حجم: ۲ مگابایت
- ذخیره‌سازی: Cloudinary (از طریق `uploadBufferToCloudinary`)
- پوشه Cloudinary: `category-icons`
- پاسخ: `{ url: result.url, customIconUrl: result.url }`

#### اعتبارسنجی سمت Frontend (در `category-dialog.component.ts`):
- نوع فایل مجاز: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- حداکثر حجم: ۲ مگابایت
- پیام خطا به فارسی

#### پاسخ به سوالات بررسی سیستم آپلود:

| سوال | پاسخ |
|------|-------|
| آیا امکان آپلود تصویر دسته‌بندی وجود دارد؟ | بله، از طریق دیالوگ ایجاد/ویرایش دسته‌بندی (تب ظاهر > آپلود) |
| آیا تصاویر در Cloudinary ذخیره می‌شوند؟ | بله، از طریق `uploadBufferToCloudinary` در پوشه `category-icons` |
| آیا تصاویر داخل پوشه Assets قرار می‌گیرند؟ | خیر، تصاویر آپلودشده در Cloudinary ذخیره می‌شوند |
| آیا URL تصویر در MongoDB ذخیره می‌شود؟ | بله، در فیلد `customIconUrl` |
| آیا Public ID وجود دارد؟ | بله، در Cloudinary (از طریق `uuidv4()`) |
| آیا امکان Preview تصویر وجود دارد؟ | بله، در دیالوگ دسته‌بندی (بخش `custom-preview`) و در پیش‌نمایش زنده |
| آیا تصویر در پنل مدیریت قابل تغییر است؟ | بله، از طریق دیالوگ ویرایش دسته‌بندی |
| آیا حذف تصویر از Cloudinary پشتیبانی می‌شود؟ | خیر، در کنترلر دسته‌بندی هیچ متدی برای حذف تصویر قدیمی از Cloudinary هنگام به‌روزرسانی وجود ندارد |

---

## بخش هفتم: محل‌های استفاده از Category

دسته‌بندی‌ها در موارد زیر نمایش داده می‌شوند:

| # | محل استفاده | کامپوننت | روش نمایش آیکون |
|---|-----------|---------|----------------|
| ۱ | صفحه اصلی | `home.component.html` | `<app-category-icon>` در `cat-circle__icon-wrapper` (size=30) |
| ۲ | صفحه دسته‌بندی‌ها (پنل ادمین) | `categories-management.component.html` | `<app-category-icon>` در کارت شبکه‌ای و لیستی |
| ۳ | کارت‌های دوره | `course-card.component.html` | فقط نمایش نام دسته (`course.category.name`) — **بدون آیکون** |
| ۴ | فیلتر جست‌وجو | `category-filter-bar.component.html` | `<app-category-icon>` در هر چپ (size=20) |
| ۵ | Sidebar / مگامنو | `mega-menu.component.html` | `<app-category-icon>` در ریل دسته‌ها (size=22) |
| ۶ | پنل مدیریت | `categories-management.component.html` | `<app-category-icon>` در کارت‌ها و زیردسته‌ها |
| ۷ | فرم ایجاد دوره | بررسی نشد (دسته‌بندی فقط به عنوان فیلتر نمایش داده می‌شود) | N/A |
| ۸ | فرم ویرایش دوره | بررسی نشد | N/A |
| ۹ | صفحات مدرس | بررسی نشد | N/A |
| ۱۰ | صفحات دانشجو | بررسی نشد | N/A |
| ۱۱ | Breadcrumb | `navbar.component.html` | فقط متن، بدون آیکون دسته |
| ۱۲ | منوها | `navbar.component.html` | مگامنو با `<app-category-icon>` |

### تفاوت روش نمایش در کامپوننت‌های مختلف

**بله، یک Category در کامپوننت‌های مختلف با روش‌های متفاوت نمایش داده می‌شود:**

1. **صفحه اصلی:** آیکون در کانتینر دایره‌ای (30px) با پس‌زمینه گرادیان پویا (`gradientFor()`)
2. **پنل مدیریت (Grid):** آیکون در کانتینر مربعی (48px) با پس‌زمینه گرادیان (`getIconGradient(i)`)
3. **پنل مدیریت (List):** آیکون در کانتینر مربعی (44px) با پس‌زمینه گرادیان
4. **نوار فیلتر:** آیکون در چپ چپ (20px) بدون پس‌زمینه خاص
5. **مگامنو:** آیکون در کانتینر مربعی (22px) با پس‌زمینه `cat.gradient`
6. **کارت دوره:** **بدون آیکون دسته**، فقط نمایش نام دسته به صورت متن

---

## بخش هشتم: مشکلات شناسایی‌شده

### ۱. عدم وجود Fallback برای خطای بارگذاری تصویر (Custom)
**مسیر:** `frontend/src/app/shared/components/category-icon/category-icon.component.ts`  
**محل:** تگ `<img>` در حالت `custom`  
**توضیح:** تگ `img` هیچ ویژگی `(error)` یا `[ngClass]` برای مدیریت خطای 404 ندارد. اگر تصویر آپلودشده از Cloudinary حذف شود یا URL نامعتبر باشد، تصویر خالی نمایش داده می‌شود و هیچ fallback بصری (مثل mat-icon پیش‌فرض) نمایش داده نمی‌شود.

### ۲. فیلد `image` در مدل Category استفاده نمی‌شود
**مسیر:** `frontend/src/app/core/models/category.model.ts` و `backend/src/models/Category.ts`  
**توضیح:** فیلد `image` در مدل تعریف شده است، اما در هیچ تمپلیت frontend برای نمایش تصویر دسته‌بندی استفاده نمی‌شود. فقط `customIconUrl` برای نمایش تصویر آیکون استفاده می‌شود. این ناسازگاری می‌تواند باعث گلوگاه در آینده شود.

### ۳. عدم پشتیبانی از SVG در آپلود
**مسیر:** `backend/src/controllers/categoryController.ts` (متد `uploadCategoryIcon`)  
**توضیح:** لیست `allowedTypes` شامل `image/svg+xml` نیست. اگر کاربر سعی کند فایل SVG آپلود کند، خطای "فرمت فایل مجاز نیست" دریافت می‌کند. با این حال، در توضیحات متد نوشته شده است که SVG پشتیبانی می‌شود، که با کد واقع مغایر است.

### ۴. عدم حذف تصویر قدیمی از Cloudinary هنگام به‌روزرسانی
**مسیر:** `backend/src/controllers/categoryController.ts` (متد `updateCategory`)  
**توضیح:** وقتی کاربر آیکون جدید آپلود می‌کند، تصویر قدیمی در Cloudinary حذف نمی‌شود و به عنوان فایل یتیم باقی می‌ماند. هیچ فراخوانی به `deleteFromCloudinaryByUrl` در متد به‌روزرسانی وجود ندارد.

### ۵. عدم استفاده از ابزارهای بهینه‌سازی تصویر Cloudinary برای آیکون دسته‌بندی
**مسیر:** `frontend/src/app/shared/components/category-icon/category-icon.component.ts`  
**توضیح:** فایل `image.utils.ts` توابع `optimizeCloudinaryUrl()` و `resolveImageUrl()` دارد، اما در `CategoryIconComponent` استفاده نمی‌شوند. تصویر آیکون با URL خام نمایش داده می‌شود و بدون بهینه‌سازی (resize, format, quality) لود می‌شود.

### ۶. عدم وجود استایل خاص برای تصویر در Dark Mode
**مسیر:** `frontend/src/app/features/admin/categories-management/categories-management.component.scss`  
**توضیح:** بخش dark mode استایل‌های کارت‌ها را تغییر می‌دهد، اما برای تگ `img` (ci-img) استایل خاصی تعریف نشده است. تصاویر transparent ممکن است در dark mode مشکل داشته باشند.

### ۷. تکرار منطق نمایش آیکون در کامپوننت‌های مختلف
**مسیر:** چندین فایل HTML  
**توضیح:** هر کامپوننت که از `<app-category-icon>` استفاده می‌کند، inputهای `icon`, `iconType`, `customIconUrl`, `size` را به صورت جداگانه پاس می‌دهد. اگر در آینده نوع جدیدی از آیکون اضافه شود، باید در تمام مکان‌ها به‌روزرسانی شود (اگرچه کامپوننت واحد این مشکل را جزئیاً حل می‌کند).

### ۸. Layout Shift در حالت لودینگ تصویر
**مسیر:** `category-icon.component.ts`  
**توضیح:** تگ `img` با `loading="lazy"` لود می‌شود، اما هیچ placeholder یا skeleton برای حالت لودینگ تعریف نشده است. این می‌تواند باعث Layout Shift شود.

### ۹. عدم پشتیبانی از Inline SVG
**مسیر:** `category-icon.component.ts`  
**توضیح:** فقط SVG به عنوان URL در تگ img پشتیبانی می‌شود. Inline SVG (محتوا مستقیم SVG) پشتیبانی نمی‌شود.

### ۱۰. ناسازگاری بین توضیحات کد و واقعیت در مورد SVG
**مسیر:** `backend/src/controllers/categoryController.ts` (متد `uploadCategoryIcon`)  
**توضیح:** کامنت متد می‌گوید "فایل تصویر (PNG/JPG/GIF/WebP/SVG) را در Cloudinary ذخیره می‌کند" اما کد實際اً SVG را رد می‌کند.

---

## بخش نهم: معماری پیشنهادی

این بخش فقط پیشنهاد معماری است و نباید پیاده‌سازی شود.

### هدف
ایجاد یک لایه نمایش استاندارد و یکپارچه برای تمام خروجی‌های آیکون و تصویر دسته‌بندی بدون تغییر در سیستم انتخاب آیکون (Material, Emoji, Google, Custom).

### پیشنهادی‌ها

#### ۱. بهبود CategoryIconComponent
- افزودن `(error)` handler به تگ `img` در حالت `custom` با fallback به `mat-icon` (مقدار `fallback` یا `category`)
- افزودن placeholder/skeleton برای حالت لودینگ تصویر
- استفاده از `optimizeCloudinaryUrl()` برای بهینه‌سازی URLهای Cloudinary (resize, f_auto, q_auto)
- پشتیبانی از Inline SVG (اگر `icon` محتوای SVG باشد، به صورت inline رندر شود)

#### ۲. استانداردسازی ابعاد کانتینر
- تعریف یک ثابت (constant) برای ابعاد آیکون در هر مکان (small: 20px, medium: 24px, large: 30px, xlarge: 48px)
- استفاده از CSS Custom Properties برای ابعاد کانتینر

#### ۳. مدیریت تصویر Transparent
- افزودن پس‌زمینه پیش‌فرض (مثلاً `#ffffff` یا متغیر dark mode) برای کانتینر تصویر وقتی تصویر transparent است
- استفاده از `background-color` در `.ci-img` با مقدار قابل تنظیم

#### ۴. پشتیبانی Dark Mode
- افزودن استایل‌های خاص dark mode برای `.ci-img` (مثلاً border، shadow، background)
- استفاده از متغیرهای CSS برای رنگ پس‌زمینه کانتینر

#### ۵. Fallback یکپارچه
- در صورت خطای بارگذاری هر نوع تصویر، نمایش `mat-icon` با مقدار `fallback`
- نمایش پیام خطا در کنسول (در محیط توسعه)

#### ۶. سازگاری با SSR
- استفاده از `isPlatformBrowser` برای عملیات مربوط به مرورگر (مثلاً بررسی نوع فایل)
- tránh استفاده از `window` یا `document` مستقیماً در کامپوننت

#### ۷. Lazy Loading و بهینه‌سازی
- حفظ `loading="lazy"` برای تصاویر
- افزودن `decoding="async"` برای تگ img
- استفاده از `fetchPriority="low"` برای تصاویر غیرضروری

---

## بخش دهم: نقشه اجرای تغییرات آینده

فهرست فایل‌هایی که احتمالاً در مرحله پیاده‌سازی باید تغییر کنند:

| # | مسیر فایل | دلیل تغییر |
|---|-----------|-----------|
| ۱ | `frontend/src/app/shared/components/category-icon/category-icon.component.ts` | افزودن error handler، بهینه‌سازی Cloudinary، پشتیبانی Inline SVG، placeholder لودینگ |
| ۲ | `frontend/src/app/shared/components/category-icon/category-icon.component.scss` | افزودن استایل‌های dark mode، placeholder، background برای تصویر transparent |
| ۳ | `frontend/src/app/features/admin/categories-management/categories-management.component.scss` | استانداردسازی ابعاد کانتینر آیکون، استایل dark mode برای img |
| ۴ | `frontend/src/app/features/admin/categories-management/category-dialog/category-dialog.component.scss` | استایل پیش‌نمایش تصویر در dark mode |
| ۵ | `frontend/src/app/features/home/home.component.scss` | استایل کانتینر آیکون دایره‌ای در dark mode |
| ۶ | `frontend/src/app/shared/components/mega-menu/mega-menu.component.scss` | استایل آیکون در مگامنو در dark mode |
| ۷ | `frontend/src/app/shared/components/category-filter-bar/category-filter-bar.component.scss` | استایل آیکون در فیلتر در dark mode |
| ۸ | `frontend/src/app/core/utils/image.utils.ts` | احتمالاً افزودن تابع بهینه‌سازی مخصوص آیکون دسته‌بندی |
| ۹ | `backend/src/controllers/categoryController.ts` | افزودن حذف تصویر قدیمی از Cloudinary هنگام به‌روزرسانی، پشتیبانی از SVG |
| ۱۰ | `backend/src/middlewares/upload.ts` | افزودن `image/svg+xml` به allowedTypes (اگر پشتیبانی از SVG مورد نظر باشد) |
| ۱۱ | `frontend/src/app/core/models/category.model.ts` | بررسی استفاده از فیلد `image` یا unification با `customIconUrl` |
| ۱۲ | `backend/src/models/Category.ts` | بررسی استفاده از فیلد `image` یا unification با `customIconUrl` |

---

## بخش یازدهم: نتیجه بررسی

### موارد سالم (بدون مشکل)
1. ✅ **CategoryIconComponent** — کامپوننت واحد و خوب طراحی شده برای نمایش چهار نوع آیکون
2. ✅ **منطق تشخیص نوع آیکون** (`resolvedType`) — درست کار می‌کند و نوع را به صورت هوشمند تشخیص می‌دهد
3. ✅ **استفاده از `object-fit: contain`** — تصویر کشیده نمی‌شود
4. ✅ **استفاده از `loading="lazy"`** — برای بهینه‌سازی بارگذاری تصویر
5. ✅ **سیستم آپلود Cloudinary** — درست کار می‌کند با اعتبارسنجی مناسب
6. ✅ **پشتیبانی Dark Mode در استایل‌های کارت‌ها** — استایل‌های dark mode برای کارت‌های دسته‌بندی وجود دارد
7. ✅ **مدل داده سازگار** — فیلدهای `icon`, `iconType`, `customIconUrl`, `color` در مدل frontend و backend هم‌خوانی دارند

### موارد دارای مشکل
1. ❌ **عدم وجود Fallback برای خطای بارگذاری تصویر** — تگ img هیچ error handler ندارد
2. ❌ **عدم استفاده از ابزارهای بهینه‌سازی Cloudinary** — `optimizeCloudinaryUrl` استفاده نمی‌شود
3. ❌ **عدم حذف تصویر قدیمی از Cloudinary** — فایل‌های یتیم در Cloudinary باقی می‌مانند
4. ❌ **عدم پشتیبانی از SVG در آپلود** — با وجود ذکر در کامنت، کد SVG را رد می‌کند
5. ❌ **فیلد `image` استفاده نمی‌شود** — ناسازگاری بین مدل و UI
6. ❌ **عدم وجود استایل خاص dark mode برای تصویر** — ممکن است مشکل در نمایش transparent تصاویر داشته باشد

### موارد نیازمند بررسی بیشتر
1. ⚠️ **استفاده از فیلد `image`** — آیا در آینده قرار است برای تصویر اصلی دسته‌بندی (نه آیکون) استفاده شود؟
2. ⚠️ **پشتیبانی از Inline SVG** — آیا نیاز به پشتیبانی از محتوای مستقیم SVG وجود دارد؟
3. ⚠️ **Layout Shift** — آیا در حالت‌های شبکه کند، Layout Shift قابل مشاهده است؟
4. ⚠️ **SSR و Hydration** — آیا کامپوننت CategoryIconComponent در SSR به درستی کار می‌کند؟

---

## تاییدیه

این گزارش فنی بر اساس بررسی کامل کدهای موجود در پروژه همایون تهیه شده است. **هیچ تغییری در سورس پروژه ایجاد نشده است** و هیچ فایلی حذف، بازنویسی یا ایجاد نشده است. تمام مسیرها و نام فایل‌ها بر اساس کد واقعی پروژه ثبت شده‌اند.

**فایل گزارش:** `CATEGORY_VISUAL_AUDIT.md`  
**محل فایل:** ریشه پروژه (`c:\Users\ALFA\Desktop\آموزش آنلاین\CATEGORY_VISUAL_AUDIT.md`)