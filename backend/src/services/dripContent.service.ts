/**
 * Drip Content Service
 * Handles scheduled content release and daily quota management
 */

import { Types } from 'mongoose';

export interface DripPolicy {
  enabled: boolean;
  lessonsPerInterval: number;
  intervalHours: number;
  requirePreviousCompletion: boolean;
  releaseAtSpecificTime?: string; // HH:mm UTC
}

export interface DripAccessResult {
  accessible: boolean;
  lockReason: 'drip' | 'quota' | 'none';
  availableAt?: Date;
  quotaUsed?: number;
  quotaLimit?: number;
  quotaResetAt?: Date;
}

export interface QuotaConsumeResult {
  success: boolean;
  quotaUsed: number;
  quotaLimit: number;
  quotaResetAt: Date;
  availableAt?: Date;
}

export class DripContentService {
  /**
   * Calculate the release time for the next lesson based on drip policy
   */
  static calculateReleaseTime(
    completedAt: Date,
    dripPolicy: DripPolicy,
    lastLessonUnlockedAt?: Date,
  ): Date {
    const baseTime = lastLessonUnlockedAt || completedAt;
    const releaseTime = new Date(baseTime.getTime() + dripPolicy.intervalHours * 60 * 60 * 1000);

    // If specific release time is set, adjust to that time on the release day
    if (dripPolicy.releaseAtSpecificTime) {
      const [hours, minutes] = dripPolicy.releaseAtSpecificTime.split(':').map(Number);
      releaseTime.setUTCHours(hours, minutes, 0, 0);

      // If the calculated time is before the base time, move to next interval
      if (releaseTime <= baseTime) {
        releaseTime.setTime(releaseTime.getTime() + dripPolicy.intervalHours * 60 * 60 * 1000);
      }
    }

    return releaseTime;
  }

  /**
   * Check if a lesson is accessible based on drip content policy
   */
  static checkDripAccess(
    enrollment: any,
    lectureIndex: number,
    dripPolicy: DripPolicy,
    courseLessonOrder: any[],
  ): DripAccessResult {
    if (!dripPolicy.enabled) {
      return { accessible: true, lockReason: 'none' };
    }

    const lecture = courseLessonOrder[lectureIndex];
    if (!lecture) {
      return { accessible: false, lockReason: 'drip' };
    }

    // NOTE: free-preview lessons are intentionally NOT bypassed here —
    // dripPolicy.enabled is only true when the course owner turned drip
    // content on, and then it applies to every lesson (first lesson stays open).

    // First lesson is always accessible
    if (lectureIndex === 0) {
      return { accessible: true, lockReason: 'none' };
    }

    // Check if previous lesson is completed (if required)
    if (dripPolicy.requirePreviousCompletion) {
      const previousLecture = courseLessonOrder[lectureIndex - 1];
      const previousCompleted = enrollment.completedLectures.some((id: Types.ObjectId) =>
        id.equals(previousLecture.lectureId),
      );

      if (!previousCompleted) {
        return { accessible: false, lockReason: 'drip' };
      }
    }

    // Check if release time has arrived
    const now = new Date();
    const nextAvailableAt = enrollment.nextLessonAvailableAt;

    if (nextAvailableAt && now < nextAvailableAt) {
      return {
        accessible: false,
        lockReason: 'drip',
        availableAt: nextAvailableAt,
      };
    }

    // Check daily quota
    const quotaResult = this.checkDailyQuota(enrollment, dripPolicy);
    if (!quotaResult.success) {
      return {
        accessible: false,
        lockReason: 'quota',
        quotaUsed: quotaResult.quotaUsed,
        quotaLimit: quotaResult.quotaLimit,
        quotaResetAt: quotaResult.quotaResetAt,
      };
    }

    return { accessible: true, lockReason: 'none' };
  }

  /**
   * Check if daily quota allows another lesson unlock
   */
  static checkDailyQuota(enrollment: any, dripPolicy: DripPolicy): QuotaConsumeResult {
    const now = new Date();
    const resetAt = enrollment.dailyQuotaResetAt
      ? new Date(enrollment.dailyQuotaResetAt)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Reset quota if reset time has passed
    let quotaUsed = enrollment.dailyQuotaUsed || 0;
    if (now >= resetAt) {
      quotaUsed = 0;
      resetAt.setTime(now.getTime() + 24 * 60 * 60 * 1000);
    }

    const quotaLimit = dripPolicy.lessonsPerInterval;

    if (quotaUsed >= quotaLimit) {
      return {
        success: false,
        quotaUsed,
        quotaLimit,
        quotaResetAt: resetAt,
      };
    }

    return {
      success: true,
      quotaUsed,
      quotaLimit,
      quotaResetAt: resetAt,
    };
  }

  /**
   * Consume daily quota for a lesson unlock
   */
  static async consumeDailyQuota(
    enrollmentId: Types.ObjectId,
    dripPolicy: DripPolicy,
  ): Promise<QuotaConsumeResult> {
    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    const now = new Date();
    let quotaUsed = enrollment.dailyQuotaUsed || 0;
    let resetAt = enrollment.dailyQuotaResetAt
      ? new Date(enrollment.dailyQuotaResetAt)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Reset quota if reset time has passed
    if (now >= resetAt) {
      quotaUsed = 0;
      resetAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    const quotaLimit = dripPolicy.lessonsPerInterval;

    if (quotaUsed >= quotaLimit) {
      return {
        success: false,
        quotaUsed,
        quotaLimit,
        quotaResetAt: resetAt,
      };
    }

    // Increment quota
    quotaUsed += 1;

    await Enrollment.findByIdAndUpdate(enrollmentId, {
      $set: {
        dailyQuotaUsed: quotaUsed,
        dailyQuotaResetAt: resetAt,
      },
    });

    return {
      success: true,
      quotaUsed,
      quotaLimit,
      quotaResetAt: resetAt,
    };
  }

  /**
   * Get the next lesson release time for display
   */
  static getNextReleaseTime(enrollment: any, dripPolicy: DripPolicy): Date | null {
    if (!dripPolicy.enabled) return null;
    return enrollment.nextLessonAvailableAt || null;
  }
}

// Import Enrollment model at the end to avoid circular dependency
import Enrollment from '../models/Enrollment';

export default DripContentService;
