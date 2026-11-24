# Course Deletion System - Technical Audit Report

**Project:** Homayoon (Persian RTL Online Learning Platform)  
**Date:** 2026-11-12  
**Auditor:** Senior Full-Stack Software Architect

---

## 1. Executive Summary

The current course deletion implementation (`deleteCourse` in `courseController.ts`) is a **dangerous hard delete** that cascade-deletes critical financial, enrollment, and historical data. This violates all production-ready requirements for a course lifecycle management system.

---

## 2. Current Implementation Analysis

### 2.1 Existing `deleteCourse` (Lines 890-1015, `courseController.ts`)

**Current behavior (DANGEROUS):**
1. Deletes all Sections and Lectures
2. **Deletes ALL Enrollments** — destroys student entitlements
3. Deletes Reviews
4. Deletes Discussions
5. Deletes Progress records
6. **Deletes Certificates** — invalidates earned credentials
7. **Deletes Payments** — destroys financial transaction history
8. **Deletes Wallet Transactions** — corrupts financial records
9. Deletes Tickets
10. Removes from Wishlists
11. Removes from Carts
12. Removes from Learning Paths
13. Removes from Coupons
14. Removes from Campaigns
15. Deletes thumbnail from Cloudinary
16. Deletes promo video from Cloudinary
17. **Deletes the Course document itself**

**Critical Issues:**
- ❌ **Financial data destroyed** — Payments, WalletTransactions, instructor revenue records
- ❌ **Student entitlements destroyed** — Enrollments, Progress, Certificates
- ❌ **No soft delete / archive option** — only permanent destruction
- ❌ **No dependency analysis** — no pre-deletion report
- ❌ **No authorization beyond admin** — instructors cannot manage their own courses
- ❌ **No audit logging** — no traceability
- ❌ **No recovery mechanism** — irreversible
- ❌ **Storage deletion without reference checking** — may delete shared assets

### 2.2 Course Model (`Course.ts`)

**Current lifecycle fields:**
- `status`: `draft` | `pending` | `published` | `rejected` | `archived` (enum `CourseStatus`)
- `publishedAt`, `rejectionReason`
- **Missing:** `isDeleted`, `deletedAt`, `deletedBy`, `deletionReason`, `deletionStatus`, `deletionOperationId`

**Existing `ARCHIVED` status** is defined but **not used** in deletion logic.

### 2.3 Related Models & Relationships

| Model | Reference Field | Relationship | Should Retain? | Financial/Legal Significance |
|-------|----------------|--------------|----------------|------------------------------|
| Enrollment | `course` | Many-to-One | ✅ YES | Student entitlement, progress, certificates |
| Payment | `items[].course` | Many-to-One | ✅ YES | Financial records, revenue sharing |
| WalletTransaction | `relatedCourse` | Many-to-One | ✅ YES | Financial audit trail |
| Certificate | `course` | Many-to-One | ✅ YES | Legal credential |
| Progress | `course` | Many-to-One | ✅ YES | Learning history |
| Review | `course` | Many-to-One | ⚠️ PARTIAL | Public content (anonymize if needed) |
| Discussion | `course` | Many-to-One | ⚠️ PARTIAL | Community content |
| Section | `course` | One-to-Many | ⚠️ CONTENT | Course structure |
| Lecture | `course` (via Section) | One-to-Many | ⚠️ CONTENT | Course content |
| Wishlist | `courses[]` | Many-to-Many | ✅ YES (remove ref) | User preference |
| Cart | `items[].course` | Many-to-Many | ✅ YES (remove ref) | Active purchase intent |
| LearningPath | `stages[].course` | Many-to-Many | ✅ YES (remove ref) | Curriculum structure |
| Coupon | `applicableCourses[]` | Many-to-Many | ✅ YES (remove ref) | Marketing |
| Campaign | `applicableCourses[]` | Many-to-Many | ✅ YES (remove ref) | Marketing |
| Ticket | `relatedCourse` | Many-to-One | ✅ YES | Support history |

---

## 3. Data Integrity Risks Identified

### 3.1 Financial Data Corruption
- **Payments deleted** → Revenue sharing calculations broken
- **WalletTransactions deleted** → Instructor payouts, platform revenue untraceable
- **WithdrawalRequests** reference payments → Broken audit trail
- **Refund records** reference payments → Cannot process refunds for deleted courses

### 3.2 Student Entitlement Destruction
- **Enrollments deleted** → Students lose access to purchased content
- **Progress deleted** → Learning history erased
- **Certificates deleted** → Earned credentials invalidated
- **No distinction** between free/paid/promotional/admin enrollments

### 3.3 Storage Asset Risks
- Current `deleteFromCloudinaryByUrl` called without checking shared references
- Arvan S3 videos deleted without `safeFileDeletionService` verification
- HLS segments, thumbnails, promo videos may be shared across courses

### 3.4 Search & Cache Inconsistency
- `listCourses` filters by `status: PUBLISHED` — deleted courses won't appear (good)
- But **no cache invalidation for related entities** (enrollments, payments, etc.)
- Search indexes not updated
- Sitemap/SEO not handled

### 3.5 Authorization Gaps
- Only `adminOnly` can delete
- Instructors cannot archive/soft-delete their own courses
- No object-level authorization for course ownership

---

## 4. Missing Functionality

| Feature | Status | Priority |
|---------|--------|----------|
| Archive course (temporary hide) | ❌ Missing | HIGH |
| Soft delete (retain history, block new access) | ❌ Missing | HIGH |
| Permanent delete (with full validation) | ❌ Missing | HIGH |
| Restore archived/soft-deleted | ❌ Missing | HIGH |
| Dependency analysis report | ❌ Missing | HIGH |
| Student entitlement preservation | ❌ Missing | CRITICAL |
| Financial record preservation | ❌ Missing | CRITICAL |
| Safe storage cleanup (shared asset check) | ⚠️ Partial (safeFileDeletionService exists) | HIGH |
| Background job for async deletion | ❌ Missing | HIGH |
| Audit logging | ❌ Missing | HIGH |
| Admin UI with confirmation dialog | ⚠️ Basic (dangerous) | HIGH |
| Instructor UI for course lifecycle | ❌ Missing | MEDIUM |
| Cache/Search/SEO cleanup | ❌ Missing | MEDIUM |

---

## 5. Existing Assets to Reuse

### 5.1 Safe File Deletion Service (`safeFileDeletionService.ts`)
- ✅ Checks shared S3 references before deletion
- ✅ Records operations in `FileDeletionOperation` model
- ✅ Implements retry with exponential backoff
- ✅ Idempotent operations
- ✅ Background job processing (`processPendingDeletions`)

### 5.2 Background Job Infrastructure
- ✅ BullMQ queues (`videoProcessingQueue`)
- ✅ Cron jobs (`cleanupJob.ts`, `reconciliationJob.ts`)
- ✅ `FileDeletionOperation` model for persistent tracking

### 5.3 Cache Invalidation
- ✅ `invalidateCache` helper in `cache.ts`
- ✅ Pattern-based Redis cache clearing

### 5.4 Authorization Middleware
- ✅ `adminOnly`, `instructorOnly` in `authorize.ts`
- ✅ `optionalAuth` for public routes

### 5.5 Frontend Components
- ✅ Admin courses list with modal pattern
- ✅ Material Design + Tailwind + RTL support
- ✅ Signal-based state management

---

## 6. Recommended Implementation Plan

### Phase 1: Backend Models & Schema (Week 1)
1. Add lifecycle fields to `Course` model
2. Create `CourseDeletionOperation` model for audit trail
3. Add indexes for lifecycle queries

### Phase 2: Core Services (Week 1-2)
1. `courseLifecycleService.ts` — Archive, Soft Delete, Restore, Permanent Delete
2. `courseDeletionAnalysisService.ts` — Dependency analysis report
3. Extend `safeFileDeletionService` for course-level cleanup
4. Background job for async deletion workflow

### Phase 3: API Endpoints (Week 2)
1. `POST /courses/:id/archive` — Admin/Instructor
2. `POST /courses/:id/restore` — Admin/Instructor
3. `POST /courses/:id/soft-delete` — Admin only
4. `POST /courses/:id/restore-deleted` — Admin only
5. `GET /courses/:id/deletion-analysis` — Admin/Instructor
6. `GET /course-deletion-operations/:id` — Admin
7. `GET /course-deletion-operations` — Admin (history)

### Phase 4: Authorization & Validation (Week 2)
1. Object-level authorization (course ownership)
2. Input validation for reasons
3. Rate limiting

### Phase 5: Frontend (Week 3)
1. Admin: Archive/Restore/Soft Delete/Delete actions
2. Dependency analysis modal with metrics
3. Multi-step confirmation dialogs
4. Instructor: Archive/Restore for own courses
5. Progress indicators for async operations

### Phase 6: Cache/Search/SEO (Week 3)
1. Cache invalidation for all related entities
2. Search index updates
3. Sitemap regeneration
4. Public URL handling (410 Gone for deleted)

### Phase 7: Testing & Documentation (Week 3-4)
1. Unit tests for lifecycle transitions
2. Integration tests for all scenarios
3. Frontend component tests
4. Technical documentation

---

## 7. Critical Decisions Required

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **Permanent delete eligibility** | Allow only if zero enrollments | Block if ANY enrollment exists (paid or free) |
| **Certificate handling** | Keep / Anonymize / Delete | **Keep** — legal requirement |
| **Payment handling** | Keep / Anonymize course ref | **Keep full record** — financial audit |
| **Storage cleanup timing** | Immediate / Scheduled / Manual | **Scheduled via background job** after validation |
| **Instructor permissions** | Archive only / Soft delete too | **Archive + Soft delete own courses** |
| **Restore window** | Unlimited / 30 days / 90 days | **Unlimited for archive, 30 days for soft delete** |

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Financial data loss | HIGH (current) | CRITICAL | Implement soft delete, never cascade delete payments |
| Student access loss | HIGH (current) | CRITICAL | Preserve enrollments, add entitlement check on access |
| Storage orphan deletion | MEDIUM | HIGH | Use `safeFileDeletionService` reference checking |
| Cache inconsistency | MEDIUM | MEDIUM | Comprehensive `invalidateCache` patterns |
| Partial failure in async job | MEDIUM | HIGH | Saga pattern with `CourseDeletionOperation` state machine |
| SEO/404 for deleted courses | LOW | MEDIUM | Return 410 Gone, update sitemap |

---

## 9. Next Steps

1. **Immediate:** Create audit report (this document)
2. **Day 1-2:** Implement Course model lifecycle fields + `CourseDeletionOperation` model
3. **Day 2-4:** Implement core lifecycle services
4. **Day 4-6:** Implement API endpoints with authorization
5. **Day 6-8:** Implement background job workflow
6. **Day 8-10:** Frontend admin/instructor UI
6. **Day 10-12:** Testing, cache/search cleanup, documentation

---

*End of Audit Report*