/**
 * Admin Course Access Controller
 * Handles admin-facing course access settings endpoints
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import CourseAccessService from '../services/courseAccess.service';
import { instructorOnly, adminOnly } from '../middlewares/authorize';

/**
 * GET /api/v1/admin/courses/:courseId/access-settings
 * Get admin course access settings
 */
export const getAdminAccessSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId } = req.params;
  if (!Types.ObjectId.isValid(courseId)) {
    throw ApiError.badRequest('شناسه دوره نامعتبر است');
  }

  // Verify course ownership (instructor or admin)
  const course = await Course.findById(courseId).select('instructor coInstructors').lean();
  if (!course) throw ApiError.notFound('دوره یافت نشد');

    const userId = req.user?._id?.toString();
    if (!userId) throw ApiError.unauthorized();
  
    const isOwner = course.instructor?.toString() === userId ||
      (course.coInstructors || []).some((id: any) => id.toString() === userId);
  
  if (!isOwner && req.user.role !== 'admin') {
    throw ApiError.forbidden('شما اجازه دسترسی به تنظیمات این دوره را ندارید');
  }

  const settings = await CourseAccessService.getAdminAccessSettings(new Types.ObjectId(courseId));

  return ApiResponse.success(res, settings, 'تنظیمات دسترسی دوره دریافت شد');
});

/**
 * PUT /api/v1/admin/courses/:courseId/access-settings
 * Update admin course access settings
 */
export const updateAdminAccessSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId } = req.params;
  if (!Types.ObjectId.isValid(courseId)) {
    throw ApiError.badRequest('شناسه دوره نامعتبر است');
  }

  // Verify course ownership (instructor or admin)
  const course = await Course.findById(courseId).select('instructor coInstructors').lean();
  if (!course) throw ApiError.notFound('دوره یافت نشد');

    const userId = req.user?._id?.toString();
    if (!userId) throw ApiError.unauthorized();
  
    const isOwner = course.instructor?.toString() === userId ||
      (course.coInstructors || []).some((id: any) => id.toString() === userId);
  
  if (!isOwner && req.user.role !== 'admin') {
    throw ApiError.forbidden('شما اجازه تغییر تنظیمات این دوره را ندارید');
  }

  const { sequentialAccess, dripContent } = req.body;

  // Validate sequential access settings
  if (sequentialAccess) {
    if (typeof sequentialAccess.enabled !== 'boolean') {
      throw ApiError.badRequest('sequentialAccess.enabled باید boolean باشد');
    }
    if (typeof sequentialAccess.requirePreviousCompletion !== 'boolean') {
      throw ApiError.badRequest('sequentialAccess.requirePreviousCompletion باید boolean باشد');
    }
  }

  // Validate drip content settings
  if (dripContent) {
    if (typeof dripContent.enabled !== 'boolean') {
      throw ApiError.badRequest('dripContent.enabled باید boolean باشد');
    }
    if (dripContent.enabled) {
      if (!Number.isInteger(dripContent.lessonsPerInterval) || dripContent.lessonsPerInterval < 1) {
        throw ApiError.badRequest('dripContent.lessonsPerInterval باید عدد صحیح مثبت باشد');
      }
      if (!Number.isInteger(dripContent.intervalHours) || dripContent.intervalHours < 1) {
        throw ApiError.badRequest('dripContent.intervalHours باید عدد صحیح مثبت باشد');
      }
      if (typeof dripContent.requirePreviousCompletion !== 'boolean') {
        throw ApiError.badRequest('dripContent.requirePreviousCompletion باید boolean باشد');
      }
      if (dripContent.releaseAtSpecificTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dripContent.releaseAtSpecificTime)) {
        throw ApiError.badRequest('dripContent.releaseAtSpecificTime باید فرمت HH:mm باشد');
      }
    }
  }

  const settings = await CourseAccessService.updateAdminAccessSettings(
    new Types.ObjectId(courseId),
    {
      sequentialAccess: sequentialAccess || { enabled: false, requirePreviousCompletion: true },
      dripContent: dripContent || { enabled: false, lessonsPerInterval: 1, intervalHours: 24, requirePreviousCompletion: true },
    }
  );

  return ApiResponse.success(res, settings, 'تنظیمات دسترسی دوره به‌روزرسانی شد');
});

// Import Course model at the end to avoid circular dependency
import Course from '../models/Course';

export default {
  getAdminAccessSettings,
  updateAdminAccessSettings,
};