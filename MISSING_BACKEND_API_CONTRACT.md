# Missing Backend API Contract for Sequential Access + Drip Content

## Overview
The backend currently **does not implement** sequential access or drip content functionality. The following APIs, models, and services need to be added to the backend before the frontend can fully integrate.

---

## 1. New Models Required

### Enrollment Extensions (add to existing Enrollment model)
```typescript
// Add to Enrollment schema
interface IEnrollment {
  // ... existing fields ...
  
  // Sequential Access
  lessonEntitlements: ILessonEntitlement[];
  
  // Drip Content
  dripPolicy?: IDripPolicy; // Course-level or enrollment-level override
  nextLessonAvailableAt?: Date; // When the next lesson unlocks
  dailyQuotaUsed: number; // Lessons unlocked today
  dailyQuotaResetAt: Date; // When daily quota resets
  lastLessonUnlockedAt?: Date; // Timestamp of last lesson unlock
}

interface ILessonEntitlement {
  lectureId: mongoose.Types.ObjectId;
  isAccessible: boolean;
  isCompleted: boolean;
  completedAt?: Date;
  unlockedAt?: Date;
  lockReason: 'sequential' | 'drip' | 'quota' | 'not_enrolled' | 'processing' | 'none';
  availableAt?: Date; // When this lesson becomes available (for drip)
}

interface IDripPolicy {
  enabled: boolean;
  lessonsPerInterval: number; // e.g., 1, 2, 3
  intervalHours: number; // e.g., 24, 12, 48
  requirePreviousCompletion: boolean; // Must complete previous lesson
  releaseAtSpecificTime?: string; // Optional: HH:mm in UTC
}
```

### Course Access Settings (new model or add to Course)
```typescript
// Add to Course schema or create CourseAccessSettings model
interface ICourseAccessSettings {
  courseId: mongoose.Types.ObjectId;
  sequentialAccess: {
    enabled: boolean;
    requirePreviousCompletion: boolean;
  };
  dripContent: {
    enabled: boolean;
    lessonsPerInterval: number;
    intervalHours: number;
    requirePreviousCompletion: boolean;
    releaseAtSpecificTime?: string; // HH:mm UTC
  };
  // Per-enrollment override support
  allowEnrollmentOverride: boolean;
}
```

---

## 2. New API Endpoints Required

### GET /api/v1/courses/:courseId/access-status
**Purpose**: Get complete access status for all lessons in a course for the current student

**Response**:
```json
{
  "success": true,
  "data": {
    "courseId": "course_id",
    "enrollmentId": "enrollment_id",
    "isEnrolled": true,
    "isFreeCourse": false,
    "sequentialAccessEnabled": true,
    "dripContentEnabled": true,
    "dripPolicy": {
      "lessonsPerInterval": 1,
      "intervalHours": 24,
      "requirePreviousCompletion": true
    },
    "lessons": [
      {
        "lectureId": "lecture_id",
        "sectionId": "section_id",
        "title": "Lesson 1",
        "order": 1,
        "isAccessible": true,
        "isCompleted": true,
        "completedAt": "2024-01-15T10:30:00Z",
        "lockReason": "none",
        "availableAt": null,
        "contentItems": [
          { "id": "item_id", "type": "video", "title": "Video 1", "isAccessible": true },
          { "id": "item_id", "type": "attachment", "title": "PDF", "isAccessible": true }
        ]
      },
      {
        "lectureId": "lecture_id_2",
        "sectionId": "section_id",
        "title": "Lesson 2",
        "order": 2,
        "isAccessible": false,
        "isCompleted": false,
        "lockReason": "drip",
        "availableAt": "2024-01-16T10:30:00Z",
        "contentItems": [
          { "id": "item_id", "type": "video", "title": "Video 2", "isAccessible": false }
        ]
      }
    ],
    "dailyQuota": {
      "used": 0,
      "limit": 1,
      "resetAt": "2024-01-16T00:00:00Z"
    },
    "nextLessonAvailableAt": "2024-01-16T10:30:00Z"
  }
}
```

### GET /api/v1/courses/:courseId/lectures/:lectureId/access
**Purpose**: Check access for a specific lecture (used when navigating directly to a lesson)

**Response**:
```json
{
  "success": true,
  "data": {
    "lectureId": "lecture_id",
    "isAccessible": true,
    "isCompleted": false,
    "lockReason": "none",
    "availableAt": null,
    "contentItems": [
      { "id": "item_id", "type": "video", "title": "Video", "isAccessible": true, "playbackUrl": "/api/v1/upload/playback/..." },
      { "id": "item_id", "type": "attachment", "title": "PDF", "isAccessible": true, "downloadUrl": "/api/v1/upload/file/..." }
    ],
    "previousLectureCompleted": true,
    "dripPolicy": { "lessonsPerInterval": 1, "intervalHours": 24 }
  }
}
```

### POST /api/v1/courses/:courseId/lectures/:lectureId/unlock
**Purpose**: Request unlock of next lesson (called when student completes a lesson)

**Request**:
```json
{
  "completedLectureId": "lecture_id"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "unlocked": true,
    "nextLectureId": "next_lecture_id",
    "availableAt": "2024-01-16T10:30:00Z",
    "lockReason": "drip",
    "dailyQuotaUsed": 1,
    "dailyQuotaLimit": 1
  }
}
```

### Admin Endpoints

#### GET /api/v1/admin/courses/:courseId/access-settings
**Response**:
```json
{
  "success": true,
  "data": {
    "courseId": "course_id",
    "sequentialAccess": { "enabled": true, "requirePreviousCompletion": true },
    "dripContent": { "enabled": true, "lessonsPerInterval": 1, "intervalHours": 24, "requirePreviousCompletion": true }
  }
}
```

#### PUT /api/v1/admin/courses/:courseId/access-settings
**Request**:
```json
{
  "sequentialAccess": { "enabled": true, "requirePreviousCompletion": true },
  "dripContent": { "enabled": true, "lessonsPerInterval": 2, "intervalHours": 12, "requirePreviousCompletion": true }
}
```

---

## 3. Backend Services Needed

### SequentialAccessService
- `getLessonOrder(courseId)` - Returns ordered array of published lecture IDs
- `getNextAccessibleLesson(enrollment, completedLectureId)` - Determines next lesson
- `checkSequentialAccess(enrollment, lectureId)` - Returns { accessible, lockReason, availableAt }

### DripContentService
- `calculateReleaseTime(enrollment, completedLecture, dripPolicy)` - Returns Date
- `checkDripAccess(enrollment, lectureId, dripPolicy)` - Returns { accessible, availableAt }
- `consumeDailyQuota(enrollment, dripPolicy)` - Returns { success, quotaUsed, quotaLimit, resetAt }

### CourseAccessService (orchestrator)
- `getFullAccessStatus(userId, courseId)` - Main endpoint for Classroom
- `getLectureAccess(userId, courseId, lectureId)` - Single lecture check
- `onLessonCompleted(userId, courseId, lectureId)` - Trigger unlock logic

---

## 4. Integration Points for Frontend

### Current Frontend APIs Used by Classroom
| Frontend Call | Current Backend Endpoint | Status |
|--------------|-------------------------|--------|
| Course details | `GET /api/v1/courses/:slug` | ✅ Exists |
| Course lectures | `GET /api/v1/courses/:courseId/lectures/all` | ✅ Exists |
| Lecture content | `GET /api/v1/courses/:courseId/sections/:sectionId/lectures` | ✅ Exists |
| Playback URL | `GET /api/v1/upload/playback/:lectureId` | ✅ Exists |
| Stream video | `GET /api/v1/upload/stream/:lectureId` | ✅ Exists |
| Serve file | `GET /api/v1/upload/file/:lectureId` | ✅ Exists |
| Progress | `GET /api/v1/progress/course/:courseId` | ✅ Exists |
| Update progress | `PUT /api/v1/progress` | ✅ Exists |

### New Frontend APIs Needed
| Frontend Feature | Required Backend Endpoint | Priority |
|-----------------|--------------------------|----------|
| Lesson access states | `GET /api/v1/courses/:courseId/access-status` | Critical |
| Single lecture access | `GET /api/v1/courses/:courseId/lectures/:lectureId/access` | Critical |
| Unlock next lesson | `POST /api/v1/courses/:courseId/lectures/:lectureId/unlock` | Critical |
| Admin settings | `GET/PUT /api/v1/admin/courses/:courseId/access-settings` | High |

---

## 5. Frontend Implementation Strategy (Current State)

Since backend APIs don't exist yet, the frontend implementation will:

1. **Create TypeScript interfaces** matching the expected API contracts above
2. **Create a new `CourseAccessService`** in frontend that:
   - Calls the new endpoints when available
   - Falls back to current behavior (all lessons accessible if enrolled) when endpoints return 404
   - Provides mock data for development/testing
3. **Update Classroom component** to use the new service
4. **Add visual states** for all lock reasons
5. **Implement countdown timers** using server-provided `availableAt` timestamps
6. **Protect content rendering** with access checks before any content loads

---

## 6. Blockers

**Cannot fully implement until backend provides:**
- [ ] `GET /api/v1/courses/:courseId/access-status` endpoint
- [ ] `GET /api/v1/courses/:courseId/lectures/:lectureId/access` endpoint
- [ ] `POST /api/v1/courses/:courseId/lectures/:lectureId/unlock` endpoint
- [ ] Enrollment model extensions (lessonEntitlements, dripPolicy, dailyQuota fields)
- [ ] CourseAccessSettings model or Course schema extensions
- [ ] SequentialAccessService, DripContentService, CourseAccessService
- [ ] Admin access settings endpoints

**Frontend can prepare:**
- [x] TypeScript interfaces for all response types
- [x] CourseAccessService with fallback/mock behavior
- [x] Classroom UI states for all lock reasons
- [x] Countdown timer component
- [x] Content protection guards
- [x] Admin settings UI (if backend APIs added)

---

## 7. Recommended Backend Implementation Order

1. Add fields to Enrollment model (lessonEntitlements, nextLessonAvailableAt, dailyQuotaUsed, dailyQuotaResetAt)
2. Add CourseAccessSettings to Course model or create separate model
3. Create SequentialAccessService, DripContentService, CourseAccessService
4. Implement GET /access-status endpoint
5. Implement GET /lectures/:lectureId/access endpoint
6. Implement POST /lectures/:lectureId/unlock endpoint
7. Add admin endpoints for access settings
8. Add middleware/guards to enforce access on all content endpoints (stream, file, playback)
9. Write tests for all access scenarios