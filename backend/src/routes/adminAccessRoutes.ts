/**
 * Admin Course Access Routes
 * Admin-facing access settings endpoints
 */

import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { instructorOnly, adminOnly } from '../middlewares/authorize';
import {
  getAdminAccessSettings,
  updateAdminAccessSettings,
} from '../controllers/adminAccessController';

const router = Router({ mergeParams: true });

// All routes require authentication + instructor/admin role
router.use(authenticate, instructorOnly);

// GET /api/v1/admin/courses/:courseId/access-settings
router.get('/:courseId/access-settings', getAdminAccessSettings);

// PUT /api/v1/admin/courses/:courseId/access-settings
router.put('/:courseId/access-settings', updateAdminAccessSettings);

export default router;
