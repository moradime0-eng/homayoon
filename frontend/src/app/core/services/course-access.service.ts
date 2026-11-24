/**
 * Course Access Service
 * Handles sequential access, drip content, and lesson entitlements
 * Integrates with backend APIs (with fallback for development)
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, of, catchError, tap, map, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';
import {
  CourseAccessStatus,
  LessonAccess,
  LectureAccessResponse,
  UnlockLessonRequest,
  UnlockLessonResponse,
  CourseAccessSettings,
  AdminCourseAccessSettingsRequest,
  AdminCourseAccessSettingsResponse,
  LockReason,
  LessonUIState,
  getLessonUIState,
  getLockReasonMessage,
} from '../models/course-access.model';
import { environment } from '../../../environments/environment.development';

@Injectable({ providedIn: 'root' })
export class CourseAccessService {
  private api = inject(ApiService);
  private baseUrl = environment.apiUrl;

  // Cache for access status per course
  private accessCache = new Map<string, { data: CourseAccessStatus; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Current course access state (for reactive UI)
  currentCourseAccess = signal<CourseAccessStatus | null>(null);
  currentLectureAccess = signal<LectureAccessResponse | null>(null);
  isLoadingAccess = signal(false);
  accessError = signal<string | null>(null);

  // Computed UI states for lessons
  lessonUIStates = computed(() => {
    const access = this.currentCourseAccess();
    if (!access) return new Map<string, LessonUIState>();
    
    const states = new Map<string, LessonUIState>();
    access.lessons.forEach(lesson => {
      states.set(lesson.lectureId, getLessonUIState(lesson));
    });
    return states;
  });

  /**
   * Get full course access status for a student
   * Falls back to mock data if backend endpoint doesn't exist (404)
   */
  getCourseAccessStatus(courseId: string, forceRefresh = false): Observable<CourseAccessStatus> {
    // Check cache first
    if (!forceRefresh) {
      const cached = this.accessCache.get(courseId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.currentCourseAccess.set(cached.data);
        return of(cached.data);
      }
    }

    this.isLoadingAccess.set(true);
    this.accessError.set(null);

    return this.api.get<CourseAccessStatus>(`/courses/${courseId}/access-status`).pipe(
      tap((response: ApiResponse<CourseAccessStatus>) => {
        if (response.success && response.data) {
          this.cacheAccessStatus(courseId, response.data);
          this.currentCourseAccess.set(response.data);
        }
        this.isLoadingAccess.set(false);
      }),
      map((response: ApiResponse<CourseAccessStatus>) => {
        if (!response.success) {
          throw new Error(response.message || 'Failed to fetch access status');
        }
        return response.data!;
      }),
      catchError((error) => {
        this.isLoadingAccess.set(false);
        
        // If endpoint doesn't exist (404), return mock data for development
        if (error.status === 404 || error.status === 0) {
          console.warn('[CourseAccessService] Backend access-status endpoint not found, using fallback');
          return this.getFallbackAccessStatus(courseId);
        }
        
        this.accessError.set(error.message || 'خطا در دریافت وضعیت دسترسی');
        return throwError(() => error);
      })
    );
  }

  /**
   * Get access status for a specific lecture
   */
  getLectureAccess(courseId: string, lectureId: string): Observable<LectureAccessResponse> {
    this.isLoadingAccess.set(true);
    this.accessError.set(null);

    return this.api.get<LectureAccessResponse>(`/courses/${courseId}/lectures/${lectureId}/access`).pipe(
      tap((response: ApiResponse<LectureAccessResponse>) => {
        if (response.success && response.data) {
          this.currentLectureAccess.set(response.data);
        }
        this.isLoadingAccess.set(false);
      }),
      map((response: ApiResponse<LectureAccessResponse>) => {
        if (!response.success) {
          throw new Error(response.message || 'Failed to fetch lecture access');
        }
        return response.data!;
      }),
      catchError((error) => {
        this.isLoadingAccess.set(false);
        
        // Fallback: derive from cached course access status
        if (error.status === 404 || error.status === 0) {
          const cached = this.currentCourseAccess();
          if (cached) {
            const lesson = cached.lessons.find(l => l.lectureId === lectureId);
            if (lesson) {
              const fallback: LectureAccessResponse = {
                lectureId: lesson.lectureId,
                isAccessible: lesson.isAccessible,
                isCompleted: lesson.isCompleted,
                lockReason: lesson.lockReason,
                availableAt: lesson.availableAt,
                contentItems: lesson.contentItems,
                previousLectureCompleted: this.isPreviousLessonCompleted(cached, lesson),
                dripPolicy: cached.dripContent,
              };
              this.currentLectureAccess.set(fallback);
              return of(fallback);
            }
          }
        }
        
        this.accessError.set(error.message || 'خطا در بررسی دسترسی درس');
        return throwError(() => error);
      })
    );
  }

  /**
   * Request unlock of next lesson after completion
   */
  unlockNextLesson(courseId: string, request: UnlockLessonRequest): Observable<UnlockLessonResponse> {
    return this.api.post<UnlockLessonResponse>(`/courses/${courseId}/lectures/${request.completedLectureId}/unlock`, request).pipe(
      tap((response: ApiResponse<UnlockLessonResponse>) => {
        if (response.success && response.data) {
          // Invalidate cache to force refresh
          this.accessCache.delete(courseId);
        }
      }),
      map((response: ApiResponse<UnlockLessonResponse>) => {
        if (!response.success) {
          throw new Error(response.message || 'Failed to unlock lesson');
        }
        return response.data!;
      })
    );
  }

  /**
   * Get admin course access settings
   */
  getAdminAccessSettings(courseId: string): Observable<AdminCourseAccessSettingsResponse> {
    return this.api.get<AdminCourseAccessSettingsResponse>(`/admin/courses/${courseId}/access-settings`).pipe(
      map((response: ApiResponse<AdminCourseAccessSettingsResponse>) => {
        if (!response.success) {
          throw new Error(response.message || 'Failed to fetch access settings');
        }
        return response.data!;
      })
    );
  }

  /**
   * Update admin course access settings
   */
  updateAdminAccessSettings(courseId: string, settings: AdminCourseAccessSettingsRequest): Observable<AdminCourseAccessSettingsResponse> {
    return this.api.put<AdminCourseAccessSettingsResponse>(`/admin/courses/${courseId}/access-settings`, settings).pipe(
      tap(() => {
        this.accessCache.delete(courseId);
      }),
      map((response: ApiResponse<AdminCourseAccessSettingsResponse>) => {
        if (!response.success) {
          throw new Error(response.message || 'Failed to update access settings');
        }
        return response.data!;
      })
    );
  }

  /**
   * Check if a lesson is accessible (synchronous check from cached data)
   */
  isLessonAccessible(lectureId: string): boolean {
    const access = this.currentCourseAccess();
    if (!access) return false;
    
    const lesson = access.lessons.find(l => l.lectureId === lectureId);
    return lesson?.isAccessible ?? false;
  }

  /**
   * Get lock reason for a lesson (synchronous from cached data)
   */
  getLessonLockReason(lectureId: string): LockReason {
    const access = this.currentCourseAccess();
    if (!access) return 'not_enrolled';
    
    const lesson = access.lessons.find(l => l.lectureId === lectureId);
    return lesson?.lockReason ?? 'not_enrolled';
  }

  /**
   * Get UI state for a lesson (synchronous from cached data)
   */
  getLessonUIState(lectureId: string): LessonUIState | null {
    return this.lessonUIStates().get(lectureId) ?? null;
  }

  /**
   * Get lock reason message for display
   */
  getLockReasonMessage(lectureId: string): string {
    const access = this.currentCourseAccess();
    if (!access) return 'اطلاعات دسترسی موجود نیست';
    
    const lesson = access.lessons.find(l => l.lectureId === lectureId);
    if (!lesson) return 'درس یافت نشد';
    
    return getLockReasonMessage(lesson.lockReason, lesson.availableAt);
  }

  /**
   * Get countdown target for a lesson
   */
  getCountdownTarget(lectureId: string): Date | null {
    const state = this.getLessonUIState(lectureId);
    return state?.countdownTarget ?? null;
  }

  /**
   * Clear cache for a course (call after enrollment, completion, etc.)
   */
  invalidateCache(courseId: string): void {
    this.accessCache.delete(courseId);
    if (this.currentCourseAccess()?.courseId === courseId) {
      this.currentCourseAccess.set(null);
    }
  }

  /**
   * Clear all caches
   */
  clearAllCache(): void {
    this.accessCache.clear();
    this.currentCourseAccess.set(null);
    this.currentLectureAccess.set(null);
  }

  // Private helpers

  private cacheAccessStatus(courseId: string, data: CourseAccessStatus): void {
    this.accessCache.set(courseId, { data, timestamp: Date.now() });
  }

  private isPreviousLessonCompleted(access: CourseAccessStatus, lesson: LessonAccess): boolean {
    const currentIndex = access.lessons.findIndex(l => l.lectureId === lesson.lectureId);
    if (currentIndex <= 0) return true; // First lesson
    
    const previousLesson = access.lessons[currentIndex - 1];
    return previousLesson.isCompleted;
  }

  /**
   * Fallback access status when backend endpoint doesn't exist
   * Assumes all lessons are accessible if enrolled (current behavior)
   */
  private getFallbackAccessStatus(courseId: string): Observable<CourseAccessStatus> {
    // This would ideally fetch course lectures and enrollment status
    // For now, return a minimal structure that allows current behavior to work
    const fallback: CourseAccessStatus = {
      courseId,
      enrollmentId: undefined,
      isEnrolled: true, // Will be overridden by actual enrollment check
      isFreeCourse: false,
      sequentialAccess: { enabled: false, requirePreviousCompletion: false },
      dripContent: { enabled: false, lessonsPerInterval: 1, intervalHours: 24, requirePreviousCompletion: true },
      lessons: [],
      dailyQuota: { used: 0, limit: 1, resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
    };
    
    this.currentCourseAccess.set(fallback);
    return of(fallback);
  }
}