/**
 * Course Access Settings Component
 * Admin interface for configuring Sequential Access and Drip Content
 */

import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { CourseAccessService } from '../../../../core/services/course-access.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  AdminCourseAccessSettingsResponse,
  AdminCourseAccessSettingsRequest,
  SequentialAccessSettings,
  DripPolicy,
} from '../../../../core/models/course-access.model';

type DripForm = DripPolicy & { enabled: boolean };

@Component({
  selector: 'app-course-access-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './course-access-settings.component.html',
  styleUrl: './course-access-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseAccessSettingsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private courseAccessService = inject(CourseAccessService);
  private toastService = inject(ToastService);

  courseId = signal<string>('');
  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  error = signal<string | null>(null);

  // ─── Form state ───
  sequentialAccess = signal<SequentialAccessSettings>({
    enabled: false,
    requirePreviousCompletion: true,
  });

  dripContent = signal<DripForm>({
    enabled: false,
    lessonsPerInterval: 1,
    intervalHours: 24,
    requirePreviousCompletion: true,
    releaseAtSpecificTime: undefined,
  });

  allowEnrollmentOverride = signal<boolean>(false);

  // ✅ FIX: باید signal باشد تا hasChanges (computed) هنگام بارگذاری تنظیمات
  // دوباره ارزیابی شود؛ اگر معمولی باشد، اولین ارزیابی با null زودتر return
  // می‌کند و هیچ وابستگی‌ای ثبت نمی‌شود → دکمه‌ها هرگز فعال نمی‌شوند
  originalSettings = signal<AdminCourseAccessSettingsResponse | null>(null);

  // ─── Dirty checking ───
  hasChanges = computed(() => {
    const o = this.originalSettings();
    if (!o) return false;
    return (
      this.sequentialAccess().enabled !== o.sequentialAccess.enabled ||
      this.sequentialAccess().requirePreviousCompletion !==
        o.sequentialAccess.requirePreviousCompletion ||
      this.dripContent().enabled !== o.dripContent.enabled ||
      this.dripContent().lessonsPerInterval !== o.dripContent.lessonsPerInterval ||
      this.dripContent().intervalHours !== o.dripContent.intervalHours ||
      this.dripContent().requirePreviousCompletion !== o.dripContent.requirePreviousCompletion ||
      this.dripContent().releaseAtSpecificTime !== o.dripContent.releaseAtSpecificTime ||
      this.allowEnrollmentOverride() !== o.allowEnrollmentOverride
    );
  });

  // Buttons should be enabled when:
  // - Reset: there are unsaved changes
  // - Save: there are unsaved changes AND drip config is valid
  canReset = computed(() => this.hasChanges());
  canSave = computed(() => this.hasChanges() && this.isDripValid());

  isDripValid = computed(() => {
    if (!this.dripContent().enabled) return true;
    return this.dripContent().lessonsPerInterval > 0 && this.dripContent().intervalHours > 0;
  });

  // ─── 🎯 Live timeline preview for drip schedule ───
  dripPreview = computed(() => {
    const d = this.dripContent();
    if (!d.enabled) return [] as { time: string; label: string; first: boolean }[];

    const items: { time: string; label: string; first: boolean }[] = [];
    const points = 4;

    for (let i = 0; i < points; i++) {
      const start = i * d.lessonsPerInterval + 1;
      const end = (i + 1) * d.lessonsPerInterval;
      items.push({
        time: this.formatOffset(i * d.intervalHours),
        label:
          start === end
            ? `درس ${this.toFa(start)}`
            : `درس ${this.toFa(start)} تا ${this.toFa(end)}`,
        first: i === 0,
      });
    }
    return items;
  });

  dripDescription = computed(() => {
    const d = this.dripContent();
    if (!d.enabled) return '';
    const interval =
      d.intervalHours % 24 === 0
        ? `${this.toFa(d.intervalHours / 24)} روز`
        : `${this.toFa(d.intervalHours)} ساعت`;
    return `هر ${interval}، ${this.toFa(d.lessonsPerInterval)} درس آزاد می‌شود`;
  });

  readonly intervalOptions = [
    { value: 1, label: 'هر ۱ ساعت' },
    { value: 2, label: 'هر ۲ ساعت' },
    { value: 4, label: 'هر ۴ ساعت' },
    { value: 6, label: 'هر ۶ ساعت' },
    { value: 8, label: 'هر ۸ ساعت' },
    { value: 12, label: 'هر ۱۲ ساعت' },
    { value: 24, label: 'هر ۲۴ ساعت (روزانه)' },
    { value: 48, label: 'هر ۴۸ ساعت' },
    { value: 72, label: 'هر ۷۲ ساعت' },
    { value: 168, label: 'هر ۱۶۸ ساعت (هفتگی)' },
  ];

  readonly lessonsPerIntervalOptions = [
    { value: 1, label: '۱ درس در هر بازه' },
    { value: 2, label: '۲ درس در هر بازه' },
    { value: 3, label: '۳ درس در هر بازه' },
    { value: 5, label: '۵ درس در هر بازه' },
    { value: 10, label: '۱۰ درس در هر بازه' },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('courseId') || '';
    this.courseId.set(id);
    if (id) {
      this.loadSettings();
    } else {
      this.error.set('شناسه دوره یافت نشد');
      this.isLoading.set(false);
    }
  }

  loadSettings(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.courseAccessService.getAdminAccessSettings(this.courseId()).subscribe({
      next: (settings) => {
        this.applySettings(settings);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'خطا در بارگذاری تنظیمات دسترسی');
        this.isLoading.set(false);
      },
    });
  }

  saveSettings(): void {
    if (this.isSaving() || !this.hasChanges() || !this.isDripValid()) return;

    // ⚠️ FIX: allowEnrollmentOverride قبلاً ارسال نمی‌شد!
    // اگه اینترفیس AdminCourseAccessSettingsRequest این فیلد رو نداره، اضافه‌ش کن
    const request: AdminCourseAccessSettingsRequest = {
      sequentialAccess: this.sequentialAccess(),
      dripContent: this.dripContent(),
      ...({ allowEnrollmentOverride: this.allowEnrollmentOverride() } as any),
    };

    this.isSaving.set(true);
    this.error.set(null);

    this.courseAccessService.updateAdminAccessSettings(this.courseId(), request).subscribe({
      next: (settings) => {
        this.applySettings(settings);
        this.isSaving.set(false);
        this.toastService.success('تنظیمات دسترسی با موفقیت ذخیره شد');
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'خطا در ذخیره تنظیمات');
        this.isSaving.set(false);
      },
    });
  }

  resetForm(): void {
    const original = this.originalSettings();
    if (original) {
      this.applySettings(original);
      this.toastService.info('تغییرات بازنشانی شد');
    }
  }

  goBack(): void {
    this.router.navigate(['/admin/courses']);
  }

  // ─── Template setter helpers (avoid spread in templates) ───
  setSequentialEnabled(enabled: boolean): void {
    this.sequentialAccess.update((s) => ({ ...s, enabled }));
  }
  setSequentialRequirePreviousCompletion(requirePreviousCompletion: boolean): void {
    this.sequentialAccess.update((s) => ({ ...s, requirePreviousCompletion }));
  }
  setDripEnabled(enabled: boolean): void {
    this.dripContent.update((s) => ({ ...s, enabled }));
  }
  setDripLessonsPerInterval(lessonsPerInterval: number): void {
    this.dripContent.update((s) => ({ ...s, lessonsPerInterval }));
  }
  setDripIntervalHours(intervalHours: number): void {
    this.dripContent.update((s) => ({ ...s, intervalHours }));
  }
  setDripRequirePreviousCompletion(requirePreviousCompletion: boolean): void {
    this.dripContent.update((s) => ({ ...s, requirePreviousCompletion }));
  }
  onReleaseTimeChange(value: string): void {
    const releaseAtSpecificTime = value === '' ? undefined : value;
    this.dripContent.update((s) => ({ ...s, releaseAtSpecificTime }));
  }
  setAllowEnrollmentOverride(allow: boolean): void {
    this.allowEnrollmentOverride.set(allow);
  }

  // ─── Private helpers ───
  private applySettings(settings: AdminCourseAccessSettingsResponse): void {
    this.originalSettings.set(settings);
    this.sequentialAccess.set({ ...settings.sequentialAccess });
    this.dripContent.set({ ...settings.dripContent });
    this.allowEnrollmentOverride.set(settings.allowEnrollmentOverride);
  }

  private formatOffset(hours: number): string {
    if (hours === 0) return 'از همان لحظه ثبت‌نام';
    if (hours % 24 === 0) {
      const days = hours / 24;
      return days === 1 ? '۱ روز بعد' : `${this.toFa(days)} روز بعد`;
    }
    return `${this.toFa(hours)} ساعت بعد`;
  }

  private toFa(n: number): string {
    return n.toLocaleString('fa-IR');
  }
}
