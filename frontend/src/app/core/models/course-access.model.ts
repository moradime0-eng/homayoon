/**
 * Course Access Models
 * Sequential Access + Drip Content Types
 * Matches expected backend API contract (see MISSING_BACKEND_API_CONTRACT.md)
 */

export type LockReason = 
  | 'none' 
  | 'sequential' 
  | 'drip' 
  | 'quota' 
  | 'not_enrolled' 
  | 'processing' 
  | 'login_required'
  | 'free_preview'
  // Legacy values from video-status.utils (for backward compatibility)
  | 'login'
  | 'enroll'
  | 'failed';

export type ContentItemType = 
  | 'video' 
  | 'rich-text' 
  | 'attachment' 
  | 'external-link' 
  | 'image' 
  | 'audio'
  | 'quiz'
  | 'assignment';

export interface ContentItemAccess {
  id: string;
  type: ContentItemType;
  title: string;
  isAccessible: boolean;
  playbackUrl?: string;
  downloadUrl?: string;
  lockReason?: LockReason;
}

export interface LessonAccess {
  lectureId: string;
  sectionId: string;
  title: string;
  description?: string;
  order: number;
  type: string;
  duration: number;
  isAccessible: boolean;
  isCompleted: boolean;
  completedAt?: string;
  lockReason: LockReason;
  availableAt?: string; // ISO timestamp when lesson becomes available
  contentItems: ContentItemAccess[];
  isFreePreview: boolean;
}

export interface DripPolicy {
  enabled: boolean;
  lessonsPerInterval: number;
  intervalHours: number;
  requirePreviousCompletion: boolean;
  releaseAtSpecificTime?: string; // HH:mm UTC
}

export interface SequentialAccessSettings {
  enabled: boolean;
  requirePreviousCompletion: boolean;
}

export interface DailyQuotaStatus {
  used: number;
  limit: number;
  resetAt: string; // ISO timestamp
}

export interface CourseAccessStatus {
  courseId: string;
  enrollmentId?: string;
  isEnrolled: boolean;
  isFreeCourse: boolean;
  sequentialAccess: SequentialAccessSettings;
  dripContent: DripPolicy;
  lessons: LessonAccess[];
  dailyQuota: DailyQuotaStatus;
  nextLessonAvailableAt?: string;
  currentLectureId?: string;
  completedLectureIds?: string[];
}

export interface LectureAccessResponse {
  lectureId: string;
  isAccessible: boolean;
  isCompleted: boolean;
  lockReason: LockReason;
  availableAt?: string;
  contentItems: ContentItemAccess[];
  previousLectureCompleted: boolean;
  dripPolicy: DripPolicy;
}

export interface UnlockLessonRequest {
  completedLectureId: string;
}

export interface UnlockLessonResponse {
  unlocked: boolean;
  nextLectureId?: string;
  availableAt?: string;
  lockReason: LockReason;
  dailyQuotaUsed: number;
  dailyQuotaLimit: number;
}

export interface CourseAccessSettings {
  courseId: string;
  sequentialAccess: SequentialAccessSettings;
  dripContent: DripPolicy & { enabled: boolean };
  allowEnrollmentOverride: boolean;
}

export interface AdminCourseAccessSettingsRequest {
  sequentialAccess: SequentialAccessSettings;
  dripContent: DripPolicy & { enabled: boolean };
}

export interface AdminCourseAccessSettingsResponse {
  courseId: string;
  sequentialAccess: SequentialAccessSettings;
  dripContent: DripPolicy & { enabled: boolean };
  allowEnrollmentOverride: boolean;
}

// UI State helpers
export interface LessonUIState {
  lesson: LessonAccess;
  displayState: 'accessible' | 'completed' | 'locked-sequential' | 'locked-drip' | 'locked-quota' | 'locked-processing' | 'not-enrolled' | 'free-preview';
  countdownTarget?: Date;
  progressPercent?: number;
}

export function getLessonUIState(lesson: LessonAccess, now: Date = new Date()): LessonUIState {
  let displayState: LessonUIState['displayState'] = 'accessible';
  let countdownTarget: Date | undefined;

  if (lesson.isCompleted) {
    displayState = 'completed';
  } else if (lesson.isAccessible) {
    displayState = lesson.isFreePreview ? 'free-preview' : 'accessible';
  } else {
    switch (lesson.lockReason) {
      case 'sequential':
        displayState = 'locked-sequential';
        break;
      case 'drip':
        displayState = 'locked-drip';
        if (lesson.availableAt) {
          countdownTarget = new Date(lesson.availableAt);
        }
        break;
      case 'quota':
        displayState = 'locked-quota';
        break;
      case 'processing':
        displayState = 'locked-processing';
        break;
      case 'not_enrolled':
        displayState = 'not-enrolled';
        break;
      case 'login_required':
        displayState = 'not-enrolled';
        break;
      default:
        displayState = 'locked-sequential';
    }
  }

  return {
    lesson,
    displayState,
    countdownTarget,
  };
}

export function getLockReasonMessage(lockReason: LockReason, availableAt?: string): string {
  const messages: Record<LockReason, string> = {
    none: '',
    sequential: 'این درس قفل است. ابتدا درس قبلی را کامل کنید.',
    drip: availableAt 
      ? `این درس در ${new Date(availableAt).toLocaleString('fa-IR')} آزاد می‌شود.`
      : 'این درس بر اساس برنامه زمانی آزاد می‌شود.',
    quota: 'سهمیه روزانه آزادسازی درس تمام شده است. فردا مجدداً تلاش کنید.',
    not_enrolled: 'برای دسترسی به این درس باید در دوره ثبت‌نام کنید.',
    processing: 'این ویدیو در حال پردازش است. لطفاً بعداً مراجعه کنید.',
    login_required: 'برای دسترسی به این محتوا ابتدا وارد شوید.',
    free_preview: 'این درس به عنوان پیش‌نمایش رایگان در دسترس است.',
    // Legacy values
    login: 'برای مشاهده این درس وارد شوید.',
    enroll: 'این درس برای دانشجویان ثبت‌نام‌شده در دوره در دسترس است.',
    failed: 'پردازش این ویدیو با خطا مواجه شد.',
  };
  return messages[lockReason] || 'دسترسی به این درس امکان‌پذیر نیست.';
}