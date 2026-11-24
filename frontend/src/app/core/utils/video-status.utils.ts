/**
 * 🎬 وضعیت ویدیو درس — تنها مرجع واحد فرانت‌اند (Single Source of Truth)
 * ============================================================
 *
 * پیش‌تر این منطق داخل `ClassroomComponent.lectureLockReason` و چند جای دیگر
 * (hasVideoContentItem / selectLecture / refreshCurrentVideoUrl) تکرار شده بود
 * و با هم فرق می‌کرد. اینجا یک‌جا جمع شده تا:
 *
 *  ۱. «وجود ویدیو» و «وضعیت پردازش» از یک جا استخراج شود.
 *  ۲. به `sanitizeLectureMedia` (ضد نشت) وفادار باشد: برای دانشجو
 *     `videoUrl` و `storage.key` حذف می‌شوند؛ شواهد دیگر مثل
 *     `storage.bucket`، `videoFileName`، `videoFileSize` باقی می‌مانند.
 *  ۳. `type === 'video'` را به‌تنهایی «وجود ویدیو» تفسیر نکند —
 *     سازنده دوره برای همه درس‌ها type پیش‌فرض `video` می‌نویسد و
 *     `processing.status` هم پیش‌فرض `PENDING` است؛ ترکیب این دو باعث
 *     پیام اشتباه «این ویدیو در حال آماده‌سازی است» می‌شد.
 *  ۴. `PENDING` را «پردازشِ در جریان» نداند: PENDING فقط پیش‌فرض اسکیماست
 *     (هنوز هیچ job ای صف نشده). وضعیت‌های واقعاً در جریان UPLOADING/PROCESSING هستند
 *     که هنگام صف شدن job توسط بک‌اند نوشته می‌شوند.
 */
import type { Lecture, ContentItem } from '../models/course.model';

/** دلیل قفل بودن درس جاری */
export type LectureLockReason = 'login' | 'enroll' | 'processing' | 'failed' | 'none';

/** وضعیت‌هایی که واقعاً پردازش در جریان است */
const IN_FLIGHT: readonly string[] = ['UPLOADING', 'PROCESSING'];

/** وضعیت‌های قطعی خطا */
const FAILED_STATUSES: readonly string[] = ['FAILED'];

export interface ProcessingSnapshot {
  status?: string;
  progress?: number;
  error?: string | null;
}

export interface LockContext {
  accessChecked: boolean;
  isAuthenticated: boolean;
  canAccess: boolean;
}

/** آیا این آیتم محتوا از نوع ویدیو است؟ */
export function isVideoContentItem(item: any): boolean {
  return item?.type === 'video';
}

/**
 * آیا آیتم ویدیویی واقعاً فایل دارد؟
 * (شواهدی که پس از sanitize هم باقی می‌مانند)
 */
export function hasContentItemVideoFile(item: any): boolean {
  if (!isVideoContentItem(item)) return false;
  return !!(
    item.storage?.key ||
    item.storage?.bucket ||
    item.videoUrl ||
    item.videoFileName ||
    (item.videoFileSize || 0) > 0 ||
    (item.videoDuration || 0) > 0
  );
}

/**
 * اولین آیتم ویدیویی که برای پخش مناسب است.
 * اول موارد دارای فایل، سپس هر آیتم ویدیویی (برای نمایش وضعیت).
 */
export function findVideoContentItem(lecture: Lecture | null | undefined): ContentItem | undefined {
  const items: any[] = (lecture as any)?.contentItems || [];
  return (
    items.find((item) => hasContentItemVideoFile(item)) ||
    items.find((item) => isVideoContentItem(item))
  );
}

/**
 * آیا درس واقعاً فایل ویدیو دارد؟
 *
 * برای هر دو ساختار قدیمی (فیلدهای خود درس) و جدید (contentItems) کار می‌کند
 * و فقط به شواهدی تکیه دارد که در پاسخ عمومی/API باقی می‌مانند.
 */
export function hasVideoEvidence(lecture: Lecture | null | undefined): boolean {
  if (!lecture) return false;

  const items: any[] = (lecture as any).contentItems || [];
  if (items.some((item) => hasContentItemVideoFile(item))) return true;

  const l = lecture as any;
  return !!(
    l.storage?.key ||
    l.storage?.bucket ||
    l.storage?.originalFileName ||
    l.videoUrl ||
    l.videoFileName ||
    (l.videoFileSize || 0) > 0 ||
    l.videoThumbnail ||
    l.videoPublicId ||
    (l.videoQualities || []).length > 0
  );
}

/** وضعیت پردازش → دلیل قفل */
export function processingToLockReason(status?: string): LectureLockReason {
  if (FAILED_STATUSES.includes(status as string)) return 'failed';
  if (IN_FLIGHT.includes(status as string)) return 'processing';
  // PENDING / READY / ناشناخته → قفل ویدیو نیست
  return 'none';
}

/**
 * 🎯 دلیل قفل بودن درس — منطق واحد و بدون تکرار
 *
 * ترتیب: دسترسی (ورود/ثبت‌نام) مقدم بر وضعیت پردازش است،
 * چون بک‌اند هم ابتدا `assertContentAccess` را بررسی می‌کند.
 */
export function resolveVideoLockReason(
  lecture: Lecture | null | undefined,
  ctx: LockContext,
): LectureLockReason {
  if (!ctx.accessChecked) return 'none';

  // ✅ پیش‌نمایش رایگان مطابق قرارداد بک‌اند (assertContentAccess) حتی بدون ثبت‌نام هم باز است
  const isPreview = !!lecture?.isFreePreview;
  if (!ctx.isAuthenticated && !isPreview) return 'login';
  if (!ctx.canAccess && !isPreview) return 'enroll';

  if (!lecture) return 'none';

  const videoItems: any[] = ((lecture as any).contentItems || []).filter(isVideoContentItem);

  if (videoItems.length > 0) {
    const statuses = videoItems.map((item) => item?.processing?.status);
    if (statuses.some((s) => FAILED_STATUSES.includes(s))) return 'failed';
    if (statuses.some((s) => IN_FLIGHT.includes(s))) return 'processing';
    return 'none';
  }

  // سیستم قدیمی (درس بدون contentItem ویدیویی)
  if (!hasVideoEvidence(lecture)) return 'none';
  return processingToLockReason((lecture as any).processing?.status);
}

/**
 * اعمال خلاصهٔ وضعیت دریافتی از `GET /upload/status/:lectureId` روی درس.
 *
 * بک‌اند وضعیت را روی همه ویدیوها و `lecture.processing` آینه می‌کند؛
 * این تابع همان آینه را روی شیء محلی اعمال می‌کند تا signalها دوباره
 * محاسبه شوند و قفل بدون تازه‌سازی صفحه برداشته شود.
 *
 * @returns نسخهٔ جدید درس (بدون mutate کردن ورودی)
 */
export function applyProcessingStatus(
  lecture: Lecture,
  snapshot: ProcessingSnapshot,
): Lecture {
  const status = snapshot.status;
  if (!status) return lecture;

  const progress = snapshot.progress ?? 0;
  const hasError = snapshot.error !== undefined && snapshot.error !== null;

  const nextProcessing: any = {
    ...(lecture as any).processing,
    status,
    progress,
    ...(hasError ? { error: snapshot.error } : {}),
  };

  const contentItems = ((lecture as any).contentItems || []).map((item: any) =>
    isVideoContentItem(item)
      ? {
          ...item,
          processing: {
            ...(item.processing || {}),
            status,
            progress,
            ...(hasError ? { error: snapshot.error } : {}),
          },
        }
      : item,
  );

  return { ...(lecture as any), processing: nextProcessing, contentItems } as Lecture;
}
