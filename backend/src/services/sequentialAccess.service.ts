/**
 * Sequential Access Service
 * Handles lesson ordering and sequential access validation
 */

import Lecture from '../models/Lecture';
import Enrollment from '../models/Enrollment';
import { Types } from 'mongoose';

export interface LessonOrderItem {
  description: string | undefined;
  lectureId: Types.ObjectId;
  sectionId: Types.ObjectId;
  title: string;
  order: number;
  type: string;
  duration: number;
  isFreePreview: boolean;
  isPublished: boolean;
}

export interface SequentialAccessResult {
  accessible: boolean;
  lockReason: 'sequential' | 'none';
  availableAt?: Date;
  previousLectureCompleted: boolean;
}

/** Course-level sequential policy (from course.accessSettings.sequentialAccess) */
export interface SequentialPolicy {
  enabled: boolean;
  requirePreviousCompletion: boolean;
}

export class SequentialAccessService {
  /**
   * Get ordered list of published lectures for a course
   * Returns lectures in the correct learning order (section order + lecture order)
   */
  static async getCourseLessonOrder(courseId: Types.ObjectId): Promise<LessonOrderItem[]> {
    const lectures = await Lecture.find({
      course: courseId,
      isPublished: true,
    })
      .select('_id section title description order duration type isFreePreview isPublished')
      .populate('section', '_id order')
      .lean();

    // Sort by section order, then lecture order
    return lectures
      .filter((l) => l.section && l.isPublished)
      .sort((a, b) => {
        const sectionOrderA = (a.section as any)?.order ?? 0;
        const sectionOrderB = (b.section as any)?.order ?? 0;
        if (sectionOrderA !== sectionOrderB) return sectionOrderA - sectionOrderB;
        return (a.order ?? 0) - (b.order ?? 0);
      })
      .map((l) => ({
        lectureId: l._id,
        sectionId: (l.section as any)?._id,
        title: l.title,
        description: l.description,
        order: l.order ?? 0,
        type: l.type,
        duration: l.duration ?? 0,
        isFreePreview: l.isFreePreview ?? false,
        isPublished: l.isPublished ?? true,
      }));
  }

  /**
   * Check if a student has sequential access to a specific lecture.
   * When `policy.enabled` is false, every published lesson is accessible.
   * When `policy.requirePreviousCompletion` is false, only the first lesson
   * is gated by order — later lessons unlock as soon as the course starts.
   */
  static async checkSequentialAccess(
    enrollment: any,
    lectureId: Types.ObjectId,
    courseLessonOrder: LessonOrderItem[],
    policy?: SequentialPolicy,
  ): Promise<SequentialAccessResult> {
    // Sequential access disabled → no gating at all
    if (policy && !policy.enabled) {
      return {
        accessible: true,
        lockReason: 'none',
        previousLectureCompleted: true,
      };
    }

    // Find the lecture in the ordered list
    const lectureIndex = courseLessonOrder.findIndex((l) => l.lectureId.equals(lectureId));

    if (lectureIndex === -1) {
      return {
        accessible: false,
        lockReason: 'sequential',
        previousLectureCompleted: false,
      };
    }

    const lecture = courseLessonOrder[lectureIndex];

    // Free preview lessons are always accessible — unless course-level
    // sequential gating is enforced (policy provided), in which case
    // previews are gated like normal lessons (first lesson stays open).
    if (lecture.isFreePreview && !policy) {
      return {
        accessible: true,
        lockReason: 'none',
        previousLectureCompleted: true,
      };
    }

    // First lesson is always accessible (if enrolled)
    if (lectureIndex === 0) {
      return {
        accessible: true,
        lockReason: 'none',
        previousLectureCompleted: true,
      };
    }

    // "Require previous completion" off → everything after the first lesson is open
    if (policy && !policy.requirePreviousCompletion) {
      return {
        accessible: true,
        lockReason: 'none',
        previousLectureCompleted: true,
      };
    }

    // Check if previous lesson is completed
    const previousLecture = courseLessonOrder[lectureIndex - 1];
    const previousCompleted = enrollment.completedLectures.some((id: Types.ObjectId) =>
      id.equals(previousLecture.lectureId),
    );

    if (!previousCompleted) {
      return {
        accessible: false,
        lockReason: 'sequential',
        previousLectureCompleted: false,
      };
    }

    return {
      accessible: true,
      lockReason: 'none',
      previousLectureCompleted: true,
    };
  }

  /**
   * Get the next accessible lecture for a student
   */
  static async getNextAccessibleLecture(
    enrollment: any,
    courseLessonOrder: LessonOrderItem[],
  ): Promise<LessonOrderItem | null> {
    for (const lecture of courseLessonOrder) {
      const isCompleted = enrollment.completedLectures.some((id: Types.ObjectId) =>
        id.equals(lecture.lectureId),
      );

      if (!isCompleted) {
        // Check if this lecture is accessible
        const access = await this.checkSequentialAccess(
          enrollment,
          lecture.lectureId,
          courseLessonOrder,
        );
        if (access.accessible) {
          return lecture;
        }
        // If not accessible due to sequential, this is the next one to unlock
        return lecture;
      }
    }

    return null; // All lessons completed
  }

  /**
   * Initialize lesson entitlements for a new enrollment
   */
  static async initializeLessonEntitlements(
    enrollmentId: Types.ObjectId,
    courseId: Types.ObjectId,
    courseAccessSettings: any,
  ): Promise<void> {
    const courseLessonOrder = await this.getCourseLessonOrder(courseId);

    const lessonEntitlements = courseLessonOrder.map((lecture, index) => {
      const isFirst = index === 0;
      const isFreePreview = lecture.isFreePreview;

      // First lesson and free previews are accessible by default
      const isAccessible = isFirst || isFreePreview;

      return {
        lectureId: lecture.lectureId,
        isAccessible,
        isCompleted: false,
        lockReason: isAccessible ? 'none' : 'sequential',
        availableAt: isAccessible ? undefined : new Date(), // Will be calculated when previous completes
      };
    });

    await Enrollment.findByIdAndUpdate(enrollmentId, {
      $set: { lessonEntitlements },
    });
  }
}

export default SequentialAccessService;
