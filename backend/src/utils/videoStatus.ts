/**
 * 🎬 وضعیت پردازش ویدیوی درس — تنها مرجع واحد در بک‌اند
 *
 * چرا این ماژول جدا شد؟
 * همان منطق پیش‌تر به‌صورت درون‌خطی داخل `getProcessingStatus` بود و قرار بود
 * در چندین نقطه (کنترلر وضعیت، سریال‌سازی درس، تست‌ها) تکرار شود.
 * اینجا یک تابع خالص (بدون دیتابیس/شبکه) داریم که هم در کنترلر استفاده می‌شود
 * هم بدون نیاز به MongoDB/Redis قابل تست است.
 *
 * ⚠️ قرارداد وضعیت‌ها (IProcessingInfo):
 *   PENDING    → پیش‌فرض اسکیما؛ یعنی «هنوز هیچ پردازشی شروع نشده» (نه اینکه در جریان باشد!)
 *   UPLOADING  → آپلود در جریان
 *   PROCESSING → job صف شده/در حال اجرا
 *   READY      → پردازش نهایی شده
 *   FAILED     → خطا
 */

/** وضعیت‌هایی که واقعاً پردازش در جریان است */
export const IN_FLIGHT_PROCESSING_STATUSES = ['UPLOADING', 'PROCESSING'] as const;

/** وضعیت‌های قطعی پایان کار */
export const TERMINAL_PROCESSING_STATUSES = ['READY', 'FAILED'] as const;

export type VideoProcessingStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export interface LectureVideoStatus {
  status: VideoProcessingStatus;
  progress: number;
  error?: string;
}

/** آیا این آیتم محتوای نوع «ویدیو» است؟ */
export function isVideoContentItem(item: any): boolean {
  return item?.type === 'video';
}

/**
 * آیا آیتم محتوا واقعاً فایل ویدیو دارد؟
 * (فقط `type === 'video'` بودن کافی نیست: آیتم‌های placeholder هنوز فایل ندارند)
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
 * آیا درس واقعاً فایل ویدیو دارد؟
 *
 * فقط به شواهد موجود در پاسخ API تکیه می‌کند چون لینک خام/کلید ذخیره‌سازی
 * برای دانشجو توسط `sanitizeLectureMedia` حذف می‌شوند (ضد نشت).
 */
export function hasLectureVideoFile(lecture: any): boolean {
  if (!lecture) return false;
  if ((lecture.contentItems || []).some(hasContentItemVideoFile)) return true;
  return !!(
    lecture.storage?.key ||
    lecture.storage?.bucket ||
    lecture.storage?.originalFileName ||
    lecture.videoUrl ||
    lecture.videoFileName ||
    (lecture.videoFileSize || 0) > 0 ||
    lecture.videoThumbnail ||
    lecture.videoPublicId ||
    (lecture.videoQualities || []).length > 0
  );
}

/**
 * 🎯 خلاصه وضعیت پردازش ویدیوی یک درس
 *
 * اولویت با ContentItemهای ویدیویی که فایل واقعی دارند (سیستم جدید)؛
 * در غیر این صورت وضعیت legacy روی خود درس.
 *
 * اگر هیچ ویدیویی در کار نباشد، وضعیت PENDINGِ پیش‌فرض اسکیما
 * برگردانده می‌شود — مصرف‌کننده باید آن را «بدون ویدیو/شروع‌نشده» تفسیر کند،
 * نه «در حال آماده‌سازی».
 */
export function resolveLectureVideoStatus(lecture: any): LectureVideoStatus {
  const contentItems: any[] = lecture?.contentItems || [];
  const videoItems = contentItems.filter(
    (item: any) => isVideoContentItem(item) && (item.storage?.key || item.videoUrl),
  );

  let status = (lecture?.processing?.status as VideoProcessingStatus) || 'PENDING';
  let progress: number = lecture?.processing?.progress ?? 0;
  let error: string | undefined;

  if (videoItems.length > 0) {
    const failed = videoItems.find((i: any) => i.processing?.status === 'FAILED');
    const inFlight = videoItems.find((i: any) =>
      (IN_FLIGHT_PROCESSING_STATUSES as readonly string[]).includes(i.processing?.status),
    );

    if (failed) {
      status = 'FAILED';
      progress = failed.processing?.progress ?? progress;
      error = failed.processing?.error;
    } else if (inFlight) {
      status = inFlight.processing.status;
      progress = inFlight.processing?.progress ?? progress;
    } else {
      // همه ویدیوها پردازش نهایی شده‌اند
      status = 'READY';
      progress = 100;
    }
  } else if (status === 'FAILED') {
    error = lecture?.processing?.error;
  }

  return { status, progress, error };
}
