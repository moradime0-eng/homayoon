/**
 * Course Access Service
 * Orchestrates sequential access, drip content, and lesson entitlements
 */

import { Types } from 'mongoose';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import Lecture from '../models/Lecture';
import { SequentialAccessService, LessonOrderItem } from './sequentialAccess.service';
import { DripContentService, DripPolicy, DripAccessResult } from './dripContent.service';

export interface LessonAccessDetail {
  lectureId: Types.ObjectId;
  sectionId: Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  type: string;
  duration: number;
  isAccessible: boolean;
  isCompleted: boolean;
  completedAt?: Date;
  lockReason: 'sequential' | 'drip' | 'quota' | 'not_enrolled' | 'processing' | 'none';
  availableAt?: Date;
  contentItems: ContentItemAccess[];
  isFreePreview: boolean;
}

export interface ContentItemAccess {
  id: Types.ObjectId;
  type: string;
  title: string;
  isAccessible: boolean;
  playbackUrl?: string;
  downloadUrl?: string;
  lockReason?: 'sequential' | 'drip' | 'quota' | 'not_enrolled' | 'processing' | 'none';
}

export interface CourseAccessStatus {
  courseId: Types.ObjectId;
  enrollmentId?: Types.ObjectId;
  isEnrolled: boolean;
  isFreeCourse: boolean;
  sequentialAccess: {
    enabled: boolean;
    requirePreviousCompletion: boolean;
  };
  dripContent: DripPolicy & { enabled: boolean };
  lessons: LessonAccessDetail[];
  dailyQuota: {
    used: number;
    limit: number;
    resetAt: Date;
  };
  nextLessonAvailableAt?: Date;
  currentLectureId?: Types.ObjectId;
  /** Lecture IDs the student has completed (drives classroom checkmarks) */
  completedLectureIds: string[];
}

export interface LectureAccessResponse {
  lectureId: Types.ObjectId;
  isAccessible: boolean;
  isCompleted: boolean;
  lockReason: 'sequential' | 'drip' | 'quota' | 'not_enrolled' | 'processing' | 'none';
  availableAt?: Date;
  contentItems: ContentItemAccess[];
  previousLectureCompleted: boolean;
  dripPolicy: DripPolicy & { enabled: boolean };
}

export interface UnlockLessonResult {
  unlocked: boolean;
  nextLectureId?: Types.ObjectId;
  availableAt?: Date;
  lockReason: 'sequential' | 'drip' | 'quota' | 'not_enrolled' | 'processing' | 'none';
  dailyQuotaUsed: number;
  dailyQuotaLimit: number;
}

export class CourseAccessService {
  /**
   * Get full course access status for a student
   */
  static async getCourseAccessStatus(
    userId: Types.ObjectId,
    courseId: Types.ObjectId,
  ): Promise<CourseAccessStatus> {
    const course = await Course.findById(courseId).select('accessSettings isFree').lean();
    if (!course) {
      throw new Error('Course not found');
    }

    const accessSettings = course.accessSettings || {
      sequentialAccess: { enabled: false, requirePreviousCompletion: true },
      dripContent: {
        enabled: false,
        lessonsPerInterval: 1,
        intervalHours: 24,
        requirePreviousCompletion: true,
      },
      allowEnrollmentOverride: false,
    };

    // Check enrollment
    const enrollment = await Enrollment.findOne({
      student: userId,
      course: courseId,
      isRefunded: false,
    }).lean();

    const isEnrolled = !!enrollment;
    const isFreeCourse = course.isFree;

    // If not enrolled and not free course, return locked status
    if (!isEnrolled && !isFreeCourse) {
      const lessonOrder = await SequentialAccessService.getCourseLessonOrder(courseId);
      const lessons = lessonOrder.map((lecture) => ({
        lectureId: lecture.lectureId,
        sectionId: lecture.sectionId,
        title: lecture.title,
        order: lecture.order,
        type: lecture.type,
        duration: lecture.duration,
        isAccessible: false,
        isCompleted: false,
        lockReason: 'not_enrolled' as const,
        contentItems: [],
        isFreePreview: lecture.isFreePreview,
      }));

      return {
        courseId,
        isEnrolled: false,
        isFreeCourse,
        sequentialAccess: accessSettings.sequentialAccess,
        dripContent: accessSettings.dripContent,
        lessons,
        dailyQuota: { used: 0, limit: 1, resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        completedLectureIds: [],
      };
    }

    // Get lesson order
    const lessonOrder = await SequentialAccessService.getCourseLessonOrder(courseId);

    // Get completed lectures
    const completedLectureIds = enrollment?.completedLectures || [];

    // Get drip policy (course-level or enrollment-level override).
    // Enrollment dripPolicy has schema defaults (enabled: false) which must NOT
    // clobber the course-level setting — only apply it as an override when enabled.
    const dripPolicy: DripPolicy & { enabled: boolean } = {
      ...accessSettings.dripContent,
      ...(enrollment?.dripPolicy?.enabled ? enrollment.dripPolicy : {}),
    };

    // Build lesson access details
    const lessons: LessonAccessDetail[] = [];

    for (let i = 0; i < lessonOrder.length; i++) {
      const lecture = lessonOrder[i];
      const isCompleted = completedLectureIds.some((id: Types.ObjectId) =>
        id.equals(lecture.lectureId),
      );
      const isFreePreview = lecture.isFreePreview;

      // Check sequential access (honors course sequentialAccess.enabled flag)
      const sequentialResult = await SequentialAccessService.checkSequentialAccess(
        enrollment || { completedLectures: [] },
        lecture.lectureId,
        lessonOrder,
        accessSettings.sequentialAccess,
      );

      // Check drip access
      const dripResult = DripContentService.checkDripAccess(
        enrollment || {
          completedLectures: [],
          dailyQuotaUsed: 0,
          dailyQuotaResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          nextLessonAvailableAt: undefined,
        },
        i,
        dripPolicy,
        lessonOrder,
      );

      // Determine overall access
      let isAccessible = false;
      let lockReason: LessonAccessDetail['lockReason'] = 'none';
      let availableAt: Date | undefined;

      const gatingEnabled = accessSettings.sequentialAccess?.enabled || dripPolicy.enabled;

      if (isFreePreview && !gatingEnabled) {
        // No course-level gating → free previews stay open
        isAccessible = true;
        lockReason = 'none';
      } else if (isEnrolled || isFreeCourse) {
        // Must pass both sequential and drip checks
        if (sequentialResult.accessible && dripResult.accessible) {
          isAccessible = true;
          lockReason = 'none';
        } else if (!sequentialResult.accessible) {
          isAccessible = false;
          lockReason = 'sequential';
        } else if (!dripResult.accessible) {
          isAccessible = false;
          lockReason = dripResult.lockReason;
          availableAt = dripResult.availableAt;
        }
      } else {
        isAccessible = false;
        lockReason = 'not_enrolled';
      }

      // Get content items for this lecture
      const lectureDoc = await Lecture.findById(lecture.lectureId).select('contentItems').lean();
      const contentItems: ContentItemAccess[] = (lectureDoc?.contentItems || []).map((item) => ({
        id: item._id,
        type: item.type,
        title: item.title,
        isAccessible,
        lockReason: isAccessible ? undefined : lockReason,
      }));

      lessons.push({
        lectureId: lecture.lectureId,
        sectionId: lecture.sectionId,
        title: lecture.title,
        description: lecture.description,
        order: lecture.order,
        type: lecture.type,
        duration: lecture.duration,
        isAccessible,
        isCompleted,
        completedAt: isCompleted ? enrollment?.completedAt : undefined,
        lockReason,
        availableAt,
        contentItems,
        isFreePreview,
      });
    }

    // Calculate daily quota
    const now = new Date();
    let quotaUsed = enrollment?.dailyQuotaUsed || 0;
    let quotaResetAt = enrollment?.dailyQuotaResetAt
      ? new Date(enrollment.dailyQuotaResetAt)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (now >= quotaResetAt) {
      quotaUsed = 0;
      quotaResetAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    return {
      courseId,
      enrollmentId: enrollment?._id,
      isEnrolled,
      isFreeCourse,
      sequentialAccess: accessSettings.sequentialAccess,
      dripContent: dripPolicy,
      lessons,
      dailyQuota: {
        used: quotaUsed,
        limit: dripPolicy.lessonsPerInterval,
        resetAt: quotaResetAt,
      },
      nextLessonAvailableAt: enrollment?.nextLessonAvailableAt,
      currentLectureId: enrollment?.currentLecture,
      completedLectureIds: completedLectureIds.map((id: Types.ObjectId) => id.toString()),
    };
  }

  /**
   * Get access status for a specific lecture
   */
  static async getLectureAccess(
    userId: Types.ObjectId,
    courseId: Types.ObjectId,
    lectureId: Types.ObjectId,
  ): Promise<LectureAccessResponse> {
    const course = await Course.findById(courseId).select('accessSettings isFree').lean();
    if (!course) {
      throw new Error('Course not found');
    }

    const accessSettings = course.accessSettings || {
      sequentialAccess: { enabled: false, requirePreviousCompletion: true },
      dripContent: {
        enabled: false,
        lessonsPerInterval: 1,
        intervalHours: 24,
        requirePreviousCompletion: true,
      },
      allowEnrollmentOverride: false,
    };

    const enrollment = await Enrollment.findOne({
      student: userId,
      course: courseId,
      isRefunded: false,
    }).lean();

    const isEnrolled = !!enrollment;
    const isFreeCourse = course.isFree;

    if (!isEnrolled && !isFreeCourse) {
      return {
        lectureId,
        isAccessible: false,
        isCompleted: false,
        lockReason: 'not_enrolled',
        contentItems: [],
        previousLectureCompleted: false,
        dripPolicy: accessSettings.dripContent,
      };
    }

    const lessonOrder = await SequentialAccessService.getCourseLessonOrder(courseId);
    const lectureIndex = lessonOrder.findIndex((l) => l.lectureId.equals(lectureId));

    if (lectureIndex === -1) {
      throw new Error('Lecture not found in course');
    }

    const lecture = lessonOrder[lectureIndex];
    const completedLectureIds = enrollment?.completedLectures || [];
    const isCompleted = completedLectureIds.some((id: Types.ObjectId) => id.equals(lectureId));
    const isFreePreview = lecture.isFreePreview;

    // Check sequential access (honors course sequentialAccess.enabled flag)
    const sequentialResult = await SequentialAccessService.checkSequentialAccess(
      enrollment || { completedLectures: [] },
      lectureId,
      lessonOrder,
      accessSettings.sequentialAccess,
    );

    // Check drip access (enrollment override only applies when explicitly enabled)
    const dripPolicy: DripPolicy & { enabled: boolean } = {
      ...accessSettings.dripContent,
      ...(enrollment?.dripPolicy?.enabled ? enrollment.dripPolicy : {}),
    };

    const dripResult = DripContentService.checkDripAccess(
      enrollment || {
        completedLectures: [],
        dailyQuotaUsed: 0,
        dailyQuotaResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        nextLessonAvailableAt: undefined,
      },
      lectureIndex,
      dripPolicy,
      lessonOrder,
    );

    let isAccessible = false;
    let lockReason: LectureAccessResponse['lockReason'] = 'none';
    let availableAt: Date | undefined;

    const gatingEnabled = accessSettings.sequentialAccess?.enabled || dripPolicy.enabled;

    if (isFreePreview && !gatingEnabled) {
      // No course-level gating → free previews stay open
      isAccessible = true;
      lockReason = 'none';
    } else if (isEnrolled || isFreeCourse) {
      if (sequentialResult.accessible && dripResult.accessible) {
        isAccessible = true;
        lockReason = 'none';
      } else if (!sequentialResult.accessible) {
        isAccessible = false;
        lockReason = 'sequential';
      } else if (!dripResult.accessible) {
        isAccessible = false;
        lockReason = dripResult.lockReason;
        availableAt = dripResult.availableAt;
      }
    } else {
      isAccessible = false;
      lockReason = 'not_enrolled';
    }

    // Get content items
    const lectureDoc = await Lecture.findById(lectureId).select('contentItems').lean();
    const contentItems: ContentItemAccess[] = (lectureDoc?.contentItems || []).map((item) => ({
      id: item._id,
      type: item.type,
      title: item.title,
      isAccessible,
      lockReason: isAccessible ? undefined : lockReason,
    }));

    return {
      lectureId,
      isAccessible,
      isCompleted,
      lockReason,
      availableAt,
      contentItems,
      previousLectureCompleted: sequentialResult.previousLectureCompleted,
      dripPolicy,
    };
  }

  /**
   * Unlock next lesson after completion
   */
  static async unlockNextLesson(
    userId: Types.ObjectId,
    courseId: Types.ObjectId,
    completedLectureId: Types.ObjectId,
  ): Promise<UnlockLessonResult> {
    const course = await Course.findById(courseId).select('accessSettings').lean();
    if (!course) {
      throw new Error('Course not found');
    }

    const accessSettings = course.accessSettings || {
      sequentialAccess: { enabled: false, requirePreviousCompletion: true },
      dripContent: {
        enabled: false,
        lessonsPerInterval: 1,
        intervalHours: 24,
        requirePreviousCompletion: true,
      },
      allowEnrollmentOverride: false,
    };

    const enrollment = await Enrollment.findOne({
      student: userId,
      course: courseId,
      isRefunded: false,
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    const lessonOrder = await SequentialAccessService.getCourseLessonOrder(courseId);
    const completedIndex = lessonOrder.findIndex((l) => l.lectureId.equals(completedLectureId));

    if (completedIndex === -1) {
      throw new Error('Completed lecture not found in course');
    }

    // Check if next lesson exists
    const nextIndex = completedIndex + 1;
    if (nextIndex >= lessonOrder.length) {
      return {
        unlocked: false,
        lockReason: 'none',
        dailyQuotaUsed: enrollment.dailyQuotaUsed || 0,
        dailyQuotaLimit: accessSettings.dripContent.lessonsPerInterval,
      };
    }

    const nextLecture = lessonOrder[nextIndex];

    // Check drip policy (enrollment override only applies when explicitly enabled)
    const dripPolicy: DripPolicy & { enabled: boolean } = {
      ...accessSettings.dripContent,
      ...(enrollment.dripPolicy?.enabled ? enrollment.dripPolicy : {}),
    };

    // Drip disabled → unlock immediately (sequential gating is enforced by access-status)
    if (!dripPolicy.enabled) {
      await Enrollment.findByIdAndUpdate(enrollment._id, {
        $set: {
          nextLessonAvailableAt: new Date(),
          lastLessonUnlockedAt: new Date(),
        },
      });

      return {
        unlocked: true,
        nextLectureId: nextLecture.lectureId,
        availableAt: new Date(),
        lockReason: 'none',
        dailyQuotaUsed: enrollment.dailyQuotaUsed || 0,
        dailyQuotaLimit: dripPolicy.lessonsPerInterval,
      };
    }

    // Drip enabled → consume daily quota and schedule release
    {
      // Consume daily quota
      const quotaResult = await DripContentService.consumeDailyQuota(enrollment._id, dripPolicy);

      if (!quotaResult.success) {
        return {
          unlocked: false,
          lockReason: 'quota',
          dailyQuotaUsed: quotaResult.quotaUsed,
          dailyQuotaLimit: quotaResult.quotaLimit,
        };
      }

      // Calculate next release time
      const nextAvailableAt = DripContentService.calculateReleaseTime(
        new Date(),
        dripPolicy,
        enrollment.lastLessonUnlockedAt,
      );

      // Update enrollment with next lesson info
      await Enrollment.findByIdAndUpdate(enrollment._id, {
        $set: {
          nextLessonAvailableAt: nextAvailableAt,
          lastLessonUnlockedAt: new Date(),
        },
      });

      return {
        unlocked: true,
        nextLectureId: nextLecture.lectureId,
        availableAt: nextAvailableAt,
        lockReason: 'drip',
        dailyQuotaUsed: quotaResult.quotaUsed,
        dailyQuotaLimit: quotaResult.quotaLimit,
      };
    }
  }

  /**
   * Record a lecture completion on the enrollment (creates one for free
   * courses so sequential/drip tracking works for non-enrolled students).
   * Returns the updated list of completed lecture IDs.
   */
  static async recordLectureCompletion(
    userId: Types.ObjectId,
    courseId: Types.ObjectId,
    lectureId: Types.ObjectId,
    existingEnrollment?: any,
  ): Promise<string[]> {
    const course = await Course.findById(courseId).select('accessSettings isFree').lean();
    if (!course) throw new Error('Course not found');

    const lecture = await Lecture.findById(lectureId).select('_id').lean();
    if (!lecture) throw new Error('Lecture not found');

    let enrollment =
      existingEnrollment ||
      (await Enrollment.findOne({
        student: userId,
        course: courseId,
        isRefunded: false,
      }));

    if (!enrollment) {
      // Only free courses can be auto-enrolled; paid courses require real enrollment
      if (!course.isFree) throw new Error('Enrollment not found');
      enrollment = await Enrollment.findOneAndUpdate(
        { student: userId, course: courseId },
        {
          $setOnInsert: {
            student: userId,
            course: courseId,
            pricePaid: 0,
            isRefunded: false,
          },
        },
        { new: true, upsert: true },
      );
    }

    const alreadyCompleted = enrollment.completedLectures.some((id: Types.ObjectId) =>
      id.equals(lectureId),
    );

    if (!alreadyCompleted) {
      enrollment.completedLectures.push(lectureId);
      enrollment.currentLecture = lectureId;
      enrollment.lastAccessedAt = new Date();

      const totalLectures = await Lecture.countDocuments({ course: courseId, isPublished: true });
      enrollment.progress =
        totalLectures > 0
          ? Math.min(100, Math.round((enrollment.completedLectures.length / totalLectures) * 100))
          : 0;

      if (enrollment.progress >= 100) {
        enrollment.isCompleted = true;
        enrollment.completedAt = enrollment.completedAt || new Date();
      }

      // Drip: consume quota and schedule the next release window
      // (enrollment override only applies when explicitly enabled)
      const dripPolicy: DripPolicy & { enabled: boolean } = {
        ...course.accessSettings?.dripContent,
        ...(enrollment.dripPolicy?.enabled ? enrollment.dripPolicy : {}),
      };
      if (dripPolicy.enabled) {
        const now = new Date();
        let quotaResetAt = enrollment.dailyQuotaResetAt
          ? new Date(enrollment.dailyQuotaResetAt)
          : new Date(now.getTime() + 24 * 60 * 60 * 1000);
        if (now >= quotaResetAt) {
          enrollment.dailyQuotaUsed = 0;
          quotaResetAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }
        enrollment.dailyQuotaResetAt = quotaResetAt;

        if (enrollment.dailyQuotaUsed < dripPolicy.lessonsPerInterval) {
          enrollment.dailyQuotaUsed = (enrollment.dailyQuotaUsed || 0) + 1;
          enrollment.nextLessonAvailableAt = DripContentService.calculateReleaseTime(
            new Date(),
            dripPolicy,
            enrollment.lastLessonUnlockedAt,
          );
          enrollment.lastLessonUnlockedAt = new Date();
        }
      }

      await enrollment.save();
    }

    return enrollment.completedLectures.map((id: Types.ObjectId) => id.toString());
  }

  /**
   * Initialize lesson entitlements for a new enrollment
   */
  static async initializeEnrollmentAccess(
    enrollmentId: Types.ObjectId,
    courseId: Types.ObjectId,
  ): Promise<void> {
    const course = await Course.findById(courseId).select('accessSettings').lean();
    if (!course) return;

    const accessSettings = course.accessSettings || {
      sequentialAccess: { enabled: false, requirePreviousCompletion: true },
      dripContent: {
        enabled: false,
        lessonsPerInterval: 1,
        intervalHours: 24,
        requirePreviousCompletion: true,
      },
      allowEnrollmentOverride: false,
    };

    await SequentialAccessService.initializeLessonEntitlements(
      enrollmentId,
      courseId,
      accessSettings,
    );
  }

  /**
   * Get admin course access settings
   */
  static async getAdminAccessSettings(courseId: Types.ObjectId): Promise<any> {
    const course = await Course.findById(courseId).select('accessSettings').lean();
    if (!course) {
      throw new Error('Course not found');
    }

    return {
      courseId,
      sequentialAccess: course.accessSettings?.sequentialAccess || {
        enabled: false,
        requirePreviousCompletion: true,
      },
      dripContent: course.accessSettings?.dripContent || {
        enabled: false,
        lessonsPerInterval: 1,
        intervalHours: 24,
        requirePreviousCompletion: true,
      },
      allowEnrollmentOverride: course.accessSettings?.allowEnrollmentOverride || false,
    };
  }

  /**
   * Update admin course access settings
   */
  static async updateAdminAccessSettings(
    courseId: Types.ObjectId,
    settings: {
      sequentialAccess: { enabled: boolean; requirePreviousCompletion: boolean };
      dripContent: {
        enabled: boolean;
        lessonsPerInterval: number;
        intervalHours: number;
        requirePreviousCompletion: boolean;
        releaseAtSpecificTime?: string;
      };
    },
  ): Promise<any> {
    const course = await Course.findByIdAndUpdate(
      courseId,
      {
        $set: {
          accessSettings: {
            sequentialAccess: settings.sequentialAccess,
            dripContent: settings.dripContent,
            allowEnrollmentOverride: false, // Keep existing or add to settings
          },
        },
      },
      { new: true },
    )
      .select('accessSettings')
      .lean();

    if (!course) {
      throw new Error('Course not found');
    }

    return {
      courseId,
      sequentialAccess: course.accessSettings?.sequentialAccess,
      dripContent: course.accessSettings?.dripContent,
      allowEnrollmentOverride: course.accessSettings?.allowEnrollmentOverride,
    };
  }
}

export default CourseAccessService;
