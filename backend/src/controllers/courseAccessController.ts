/**
 * Course Access Controller
 * Handles student-facing course access endpoints
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import CourseAccessService, {
  CourseAccessStatus,
  LectureAccessResponse,
  UnlockLessonResult,
} from '../services/courseAccess.service';

/**
 * GET /api/v1/courses/:courseId/access-status
 * Get full course access status for the current student
 */
export const getCourseAccessStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId } = req.params;
  if (!Types.ObjectId.isValid(courseId)) {
    throw ApiError.badRequest('شناسه دوره نامعتبر است');
  }

  const accessStatus: CourseAccessStatus = await CourseAccessService.getCourseAccessStatus(
    req.user._id,
    new Types.ObjectId(courseId),
  );

  return ApiResponse.success(res, accessStatus, 'وضعیت دسترسی دوره دریافت شد');
});

/**
 * GET /api/v1/courses/:courseId/lectures/:lectureId/access
 * Get access status for a specific lecture
 */
export const getLectureAccess = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId, lectureId } = req.params;

  if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(lectureId)) {
    throw ApiError.badRequest('شناسه دوره یا درس نامعتبر است');
  }

  const lectureAccess: LectureAccessResponse = await CourseAccessService.getLectureAccess(
    req.user._id,
    new Types.ObjectId(courseId),
    new Types.ObjectId(lectureId),
  );

  return ApiResponse.success(res, lectureAccess, 'وضعیت دسترسی درس دریافت شد');
});

/**
 * POST /api/v1/courses/:courseId/lectures/:lectureId/unlock
 * Request unlock of next lesson after completion
 */
export const unlockNextLesson = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId, lectureId } = req.params;

  if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(lectureId)) {
    throw ApiError.badRequest('شناسه دوره یا درس نامعتبر است');
  }

  const result: UnlockLessonResult = await CourseAccessService.unlockNextLesson(
    req.user._id,
    new Types.ObjectId(courseId),
    new Types.ObjectId(lectureId),
  );

  return ApiResponse.success(
    res,
    result,
    result.unlocked ? 'درس بعدی باز شد' : 'درس بعدی همچنان قفل است',
  );
});

export default {
  getCourseAccessStatus,
  getLectureAccess,
  unlockNextLesson,
};
