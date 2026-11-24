# Course Lifecycle & Deletion Policy

**Project:** Homayoon  
**Version:** 1.0  
**Date:** 2026-11-12

---

## 1. Course Lifecycle States

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  DRAFT  │────▶│ PENDING  │────▶│ PUBLISHED │────▶│ ARCHIVED │
└─────────┘     └──────────┘     └───────────┘     └────┬─────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SOFT DELETED (deleted)                       │
│  - Hidden from public                                           │
│  - No new enrollments/purchases                                 │
│  - Existing students retain access                              │
│  - All historical data preserved                                │
│  - Restorable within 30 days                                    │
└─────────────────────────────────────────────────────────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PERMANENTLY DELETED (purged)                   │
│  - ONLY after validation passes                                 │
│  - Course document removed                                      │
│  - Storage assets cleaned (if not shared)                       │
│  - Historical records ANONYMIZED not deleted                    │
│  - IRREVERSIBLE                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. State Definitions

### 2.1 DRAFT
- Course being created/edited by instructor
- Not visible to students
- Only instructor and admins can access

### 2.2 PENDING
- Submitted for admin review
- Not publicly discoverable
- Instructor can view, not edit

### 2.3 PUBLISHED
- Publicly discoverable and purchasable
- Students can enroll/purchase
- Full platform features active

### 2.4 ARCHIVED
- **Temporarily removed from active management**
- Not publicly discoverable (excluded from listings, search)
- **Existing eligible students RETAIN access**
- Financial history untouched
- Course content retained
- **Restorable by instructor/admin**
- Admin can inspect archived courses

### 2.5 SOFT DELETED (`deleted: true`)
- **Removed from normal platform operation**
- Excluded from public listings and search
- **New enrollments and purchases BLOCKED**
- **Eligible existing students RETAIN entitlements**
- Historical purchases accessible
- Financial records intact
- Certificates remain valid
- Student progress intact
- Course content retained (unless separate cleanup authorized)
- **Restorable by admin within 30 days**
- After 30 days → eligible for permanent deletion

### 2.6 PERMANENTLY DELETED (`purged: true`)
- **Highly restricted operation**
- Course document removed from database
- Storage assets cleaned (only if not shared)
- Historical records **ANONYMIZED** (not deleted):
  - Payments: keep amounts, dates, shares; replace course ref with `{ _id: null, title: '[حذف شده]', slug: null }`
  - Enrollments: keep progress, completion; replace course ref similarly
  - Certificates: keep valid; replace course ref
  - WalletTransactions: keep intact
  - Reviews: anonymize student info, keep rating
- **IRREVERSIBLE**

---

## 3. Transition Rules

| From → To | Allowed By | Conditions |
|-----------|------------|------------|
| DRAFT → PENDING | Instructor | Course meets minimum requirements |
| PENDING → PUBLISHED | Admin | Approved |
| PENDING → REJECTED | Admin | With reason |
| PENDING → DRAFT | Instructor | Withdraw submission |
| PUBLISHED → ARCHIVED | Instructor/Admin | Any time |
| ARCHIVED → PUBLISHED | Instructor/Admin | Any time |
| PUBLISHED → SOFT DELETED | Admin | Dependency analysis passed |
| ARCHIVED → SOFT DELETED | Admin | Dependency analysis passed |
| SOFT DELETED → PUBLISHED | Admin | Within 30 days, no conflicts |
| SOFT DELETED → ARCHIVED | Admin | Within 30 days |
| SOFT DELETED → PERMANENTLY DELETED | Admin (super) | All validation checks pass, 30 days elapsed |

---

## 4. Student Access Rules

### 4.1 Entitlement Types (Preserved from Existing Logic)

| Type | Description | Survives Soft Delete? | Survives Permanent Delete? |
|------|-------------|----------------------|---------------------------|
| **Purchased** | Paid enrollment via payment | ✅ YES | ✅ YES (anonymized) |
| **Free** | Free course enrollment | ✅ YES | ✅ YES (anonymized) |
| **Promotional** | Coupon/campaign 100% discount | ✅ YES | ✅ YES (anonymized) |
| **Administrative** | Admin-granted access | ✅ YES | ✅ YES (anonymized) |
| **Expired** | Time-limited access ended | ❌ NO (already expired) | ❌ NO |
| **Revoked** | Access removed (policy violation) | ❌ NO | ❌ NO |
| **Refunded** | Payment refunded | ❌ NO (isRefunded=true) | ❌ NO |

### 4.2 Access Verification (Every Protected Request)

```typescript
// For any course content access (video, PDF, quiz, etc.):
async function verifyCourseAccess(userId: string, courseId: string): Promise<boolean> {
  const course = await Course.findById(courseId);
  if (!course) return false;
  
  // Public access for published courses
  if (course.status === 'published' && course.isFree) return true;
  
  // Admin/instructor always have access
  if (user.role === 'admin' || course.instructor.equals(userId)) return true;
  
  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: userId,
    course: courseId,
    isRefunded: false,
  });
  
  if (!enrollment) return false;
  
  // For soft-deleted courses, only enrolled students can access
  if (course.deleted) {
    return !!enrollment; // Must have valid enrollment
  }
  
  return true;
}
```

### 4.3 Blocked Operations on Soft-Deleted Courses
- ❌ New purchases
- ❌ New free enrollments
- ❌ Add to cart
- ❌ Add to wishlist
- ❌ Apply coupons
- ❌ Public search/listing
- ❌ Instructor content edits

### 4.4 Allowed Operations on Soft-Deleted Courses
- ✅ Existing student content access (videos, materials)
- ✅ Progress tracking
- ✅ Certificate download
- ✅ Review existing (read-only)
- ✅ Purchase history view
- ✅ Instructor revenue reports

---

## 5. Financial Data Integrity Rules

### 5.1 NEVER Cascade Delete
- ❌ Payments
- ❌ WalletTransactions
- ❌ WithdrawalRequests
- ❌ Instructor revenue records
- ❌ Settlement records
- ❌ Refund records

### 5.2 Preserve Original Values
- Transaction amounts (exact)
- Instructor/platform shares (exact)
- Purchase timestamps
- Discount/coupon/campaign info
- Payment gateway references

### 5.3 Anonymization Strategy (Permanent Delete Only)
```typescript
// Payment items - keep financial data, anonymize course reference
{
  course: { _id: null, title: '[دوره حذف شده]', slug: null },
  price: 50000,           // PRESERVED
  adjustedPrice: 40000,   // PRESERVED
  instructorShare: 28000, // PRESERVED
  platformShare: 12000,   // PRESERVED
}

// Enrollment - keep progress, anonymize course
{
  course: { _id: null, title: '[دوره حذف شده]', slug: null },
  pricePaid: 40000,       // PRESERVED
  progress: 75,           // PRESERVED
  isCompleted: true,      // PRESERVED
  completedAt: Date,      // PRESERVED
  certificateIssued: true,// PRESERVED
}
```

### 5.4 Reporting Continuity
- Instructor dashboard revenue reports must continue working
- Platform revenue reports must continue working
- Tax/accounting records unaffected
- Reconciliation jobs must not break

---

## 6. Storage Cleanup Policy

### 6.1 Principles
1. **Never delete based only on course ID**
2. **Check shared references** before any deletion
3. **Verify no retained entitlement** requires the asset
4. **Use existing `safeFileDeletionService`**
5. **Background job only** — never synchronous
6. **Record every attempt** in `FileDeletionOperation`
7. **Retry transient failures** with exponential backoff

### 6.2 Asset Categories

| Asset Type | Cleanup Trigger | Shared Check |
|------------|-----------------|--------------|
| Course thumbnail | Permanent delete | Cloudinary public_id unique per course |
| Promo video | Permanent delete | Check `promoVideoKey` across courses |
| Lecture videos (HLS) | Permanent delete | `safeFileDeletionService` checks all lectures |
| Lecture attachments | Permanent delete | Check `storage.key` across content items |
| Section/lecture thumbnails | Permanent delete | Check references |

### 6.3 Cleanup Workflow
1. Course marked `purged: true`
2. `CourseDeletionCleanupJob` queued
3. Job collects all S3/Cloudinary keys for course
4. For each key: check `isS3KeyReferencedElsewhere()`
5. If not referenced → create `FileDeletionOperation` → delete
6. If referenced → skip, log
7. Job completes → update `CourseDeletionOperation.status = 'completed'`

---

## 7. Background Job Architecture

### 7.1 Job Types

| Job | Queue | Trigger | Retry |
|-----|-------|---------|-------|
| `course-deletion-analysis` | default | API request | N/A (sync) |
| `course-soft-delete` | course-lifecycle | Admin action | 3x exponential |
| `course-restore` | course-lifecycle | Admin action | 3x |
| `course-permanent-delete` | course-lifecycle | Admin action (30d+) | 3x |
| `course-storage-cleanup` | course-lifecycle | After permanent delete | 5x (via FileDeletionOperation) |
| `course-cache-invalidation` | default | Any lifecycle change | 3x |

### 7.2 State Machine (CourseDeletionOperation)

```
PENDING → ANALYZING → PROCESSING → CLEANUP_PENDING → COMPLETED
                ↓           ↓              ↓
              FAILED     FAILED        FAILED
                ↓           ↓              ↓
             CANCELLED  CANCELLED     PARTIALLY_COMPLETED
```

### 7.3 Idempotency
- All jobs use `CourseDeletionOperation` record as source of truth
- Jobs check current state before proceeding
- Safe to re-run after crash/restart

---

## 8. API Design

### 8.1 Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/courses/:id/archive` | Instructor/Admin | Archive course |
| POST | `/courses/:id/restore` | Instructor/Admin | Restore from archive |
| POST | `/courses/:id/soft-delete` | Admin | Soft delete course |
| POST | `/courses/:id/restore-deleted` | Admin | Restore soft-deleted (≤30d) |
| GET | `/courses/:id/deletion-analysis` | Instructor/Admin | Dependency report |
| POST | `/courses/:id/permanent-delete` | Super Admin | Permanent delete (validated) |
| GET | `/course-deletion-operations` | Admin | List operations |
| GET | `/course-deletion-operations/:id` | Admin | Operation details |

### 8.2 Request/Response Examples

**Archive Course:**
```http
POST /api/v1/courses/abc123/archive
Authorization: Bearer <token>
Content-Type: application/json

{ "reason": "Course outdated, updating content" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "course": { "id": "abc123", "status": "archived", "archivedAt": "2026-11-12T..." },
    "message": "دوره بایگانی شد"
  }
}
```

**Deletion Analysis:**
```http
GET /api/v1/courses/abc123/deletion-analysis
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "course": { "title": "React Advanced", "instructor": "Ali Rezaei" },
    "metrics": {
      "totalStudents": 1250,
      "paidEnrollments": 890,
      "freeEnrollments": 360,
      "sections": 12,
      "lectures": 84,
      "storageUsageGB": 15.2,
      "financialRecords": 890,
      "outstandingRefunds": 0,
      "unsettledRevenue": 0,
      "issuedCertificates": 445,
      "reviews": 312,
      "discussions": 89
    },
    "warnings": [
      "دوره دارای ۸۹۰ ثبت‌نام پولی است — حذف دائمی غیرممکن است",
      "۴۴۵ گواهی‌نامه صادر شده — حذف دائمی گواهی‌نامه‌ها را بی‌اعتبار می‌کند"
    ],
    "canSoftDelete": true,
    "canPermanentDelete": false,
    "blockingReasons": ["HAS_PAID_ENROLLMENTS", "HAS_CERTIFICATES"]
  }
}
```

---

## 9. Authorization Matrix

| Operation | Admin | Instructor (Owner) | Instructor (Co) | Student |
|-----------|-------|-------------------|-----------------|---------|
| Archive | ✅ | ✅ | ❌ | ❌ |
| Restore from Archive | ✅ | ✅ | ❌ | ❌ |
| Soft Delete | ✅ | ❌ | ❌ | ❌ |
| Restore Soft Deleted | ✅ | ❌ | ❌ | ❌ |
| Permanent Delete | ✅ (super) | ❌ | ❌ | ❌ |
| View Deletion Analysis | ✅ | ✅ | ✅ | ❌ |
| View Deletion History | ✅ | ❌ | ❌ | ❌ |

---

## 10. Cache, Search & SEO

### 10.1 Cache Invalidation Patterns
On ANY lifecycle change:
```
cache:*courses*
cache:*search*
cache:*category:*
cache:*instructor:*
cache:*home*
cache:*dashboard*
```

### 10.2 Search Index
- Remove from Elasticsearch/Meilisearch on soft delete
- Re-add on restore
- Never index deleted/purged courses

### 10.3 Public URLs
- `/courses/:slug` → 410 Gone for deleted/purged
- `/courses/:slug` → 404 for archived (or redirect to category)
- Preserve `/learning/:courseId` for enrolled students (entitlement check)

### 10.4 Sitemap
- Regenerate on lifecycle change
- Exclude non-published courses

---

## 11. Audit Logging

Every lifecycle operation logs to `CourseDeletionOperation`:
```typescript
{
  courseId: ObjectId,
  operationType: 'archive' | 'restore' | 'soft_delete' | 'restore_deleted' | 'permanent_delete',
  initiatedBy: ObjectId (admin/instructor),
  reason: String,
  previousState: String,
  newState: String,
  dependencyAnalysis: Object, // snapshot
  status: 'pending' | 'analyzing' | 'processing' | 'cleanup_pending' | 'completed' | 'failed' | 'partially_completed' | 'cancelled',
  startedAt: Date,
  completedAt: Date,
  failureDetails: String,
  jobIds: [String], // BullMQ job IDs
  affectedCounts: {
    enrollments: Number,
    payments: Number,
    certificates: Number,
    storageKeys: Number,
  }
}
```

**Never log:** passwords, JWTs, payment secrets, storage credentials, PII

---

## 12. Testing Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Course with 0 students | All operations allowed |
| Course with free students only | Soft delete allowed, permanent blocked |
| Course with paid students | Soft delete allowed, permanent blocked |
| Course with completed students + certificates | Soft delete allowed, permanent blocked |
| Course with pending payments | Soft delete allowed (payments expire naturally) |
| Course with successful payments | Soft delete allowed, permanent blocked |
| Course with outstanding refunds | Soft delete allowed, permanent blocked |
| Course with unsettled instructor revenue | Soft delete allowed, permanent blocked |
| Course with shared media assets | Storage cleanup skips shared assets |
| Course with failed S3 deletion | Job retries, logs failure, continues |
| Worker crash during deletion | Job resumes from `CourseDeletionOperation` state |
| Duplicate deletion request | Idempotent — returns existing operation |
| Concurrent purchase + soft delete | Purchase blocked (course not published) |

---

*End of Policy Document*