/**
 * Course Access Routes
 * Student-facing access endpoints
 */

import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  getCourseAccessStatus,
  getLectureAccess,
  unlockNextLesson,
} from '../controllers/courseAccessController';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authenticate);

// GET /api/v1/courses/:courseId/access-status
router.get('/access-status', getCourseAccessStatus);

// GET /api/v1/courses/:courseId/lectures/:lectureId/access
router.get('/lectures/:lectureId/access', getLectureAccess);

// POST /api/v1/courses/:courseId/lectures/:lectureId/unlock
router.post('/lectures/:lectureId/unlock', unlockNextLesson);

export default router;