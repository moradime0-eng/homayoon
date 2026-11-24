import {
  applyProcessingStatus,
  findVideoContentItem,
  hasVideoEvidence,
  processingToLockReason,
  resolveVideoLockReason,
} from './video-status.utils';
import type { Lecture } from '../models/course.model';

const AUTHED = { accessChecked: true, isAuthenticated: true, canAccess: true };

/** درس legacy فقط با type=video و processing پیش‌فرض (بدون هیچ فایلی) */
function lectureWithoutVideo(): Lecture {
  return {
    _id: 'l1',
    type: 'video',
    processing: { status: 'PENDING', progress: 0 } as any,
    resources: [],
    contentItems: [],
    isFreePreview: false,
    isPublished: true,
  } as unknown as Lecture;
}

/** درس legacy با ویدیوی آپلودشده — بعد از sanitize (کلید/لینک خام حذف شده) */
function legacyReadyLecture(): Lecture {
  return {
    _id: 'l2',
    type: 'video',
    storage: { provider: 'arvan', bucket: 'iranian-udemy-videos', key: '', originalFileName: 'a.mp4' },
    processing: { status: 'READY', progress: 100 } as any,
    resources: [],
    contentItems: [],
    isFreePreview: false,
    isPublished: true,
  } as unknown as Lecture;
}

/** درس جدید با contentItem ویدیویی (بعد از sanitize) */
function contentItemLecture(itemProcessing: any): Lecture {
  return {
    _id: 'l3',
    type: 'video',
    // آینهٔ وضعیت روی خود درس (بک‌اند هم همین را می‌نویسد)
    processing: { ...(itemProcessing || {}) } as any,
    resources: [],
    isFreePreview: false,
    isPublished: true,
    contentItems: [
      {
        _id: 'ci1',
        type: 'video',
        title: 'ویدیو',
        order: 0,
        storage: { provider: 'arvan', bucket: 'iranian-udemy-videos', originalFileName: 'a.mp4' },
        processing: itemProcessing,
      },
      {
        _id: 'ci2',
        type: 'rich-text',
        title: 'متن',
        order: 1,
        richTextContent: '<p>salam</p>',
      },
    ],
  } as unknown as Lecture;
}

describe('resolveVideoLockReason — دسترسی', () => {
  it('تا وقتی دسترسی بررسی نشده قفلی گزارش نمی‌کند', () => {
    expect(
      resolveVideoLockReason(legacyReadyLecture(), {
        accessChecked: false,
        isAuthenticated: true,
        canAccess: false,
      }),
    ).toBe('none');
  });

  it('کاربر وارد نشده → login (مگر پیش‌نمایش رایگان)', () => {
    expect(
      resolveVideoLockReason(legacyReadyLecture(), {
        accessChecked: true,
        isAuthenticated: false,
        canAccess: false,
      }),
    ).toBe('login');
  });

  it('ثبت‌نام نکرده → enroll', () => {
    expect(
      resolveVideoLockReason(legacyReadyLecture(), {
        accessChecked: true,
        isAuthenticated: true,
        canAccess: false,
      }),
    ).toBe('enroll');
  });

  it('پیش‌نمایش رایگان بدون ثبت‌نام باز است', () => {
    const lecture = { ...legacyReadyLecture(), isFreePreview: true };
    expect(
      resolveVideoLockReason(lecture, {
        accessChecked: true,
        isAuthenticated: false,
        canAccess: false,
      }),
    ).toBe('none');
  });
});

describe('resolveVideoLockReason — وضعیت پردازش', () => {
  it(' REGRESSION: درسِ type=video بدون فایل و با PENDING پیش‌فرض نباید «در حال آماده‌سازی» باشد', () => {
    expect(resolveVideoLockReason(lectureWithoutVideo(), AUTHED)).toBe('none');
  });

  it('درسِ متنی (فقط rich-text) با type=video قفل ویدیو نمی‌گیرد', () => {
    const textOnly = {
      _id: 'l5',
      type: 'video',
      resources: [],
      contentItems: [{ _id: 'ci', type: 'rich-text', order: 0, richTextContent: '<p>x</p>' }],
    } as unknown as Lecture;
    expect(resolveVideoLockReason(textOnly, AUTHED)).toBe('none');
  });

  it('PENDING به معنی «شروع نشده» است نه «در جریان»', () => {
    expect(processingToLockReason('PENDING')).toBe('none');
    const pendingLegacy = { ...legacyReadyLecture(), processing: { status: 'PENDING' } } as Lecture;
    expect(resolveVideoLockReason(pendingLegacy, AUTHED)).toBe('none');
  });

  it('ویدیوی در جریان (PROCESSING / UPLOADING) قفل آماده‌سازی می‌گیرد', () => {
    expect(resolveVideoLockReason(contentItemLecture({ status: 'PROCESSING' }), AUTHED)).toBe('processing');
    expect(resolveVideoLockReason(contentItemLecture({ status: 'UPLOADING' }), AUTHED)).toBe('processing');
  });

  it('ویدیوی آماده (READY) قفل نمی‌گیرد — پیام اشتباه آماده‌سازی نمایش داده نمی‌شود', () => {
    expect(resolveVideoLockReason(contentItemLecture({ status: 'READY' }), AUTHED)).toBe('none');
    expect(resolveVideoLockReason(legacyReadyLecture(), AUTHED)).toBe('none');
  });

  it('ویدیوی دارای خطا → failed', () => {
    expect(resolveVideoLockReason(contentItemLecture({ status: 'FAILED' }), AUTHED)).toBe('failed');
    const legacy = { ...legacyReadyLecture(), processing: { status: 'FAILED' } } as Lecture;
    expect(resolveVideoLockReason(legacy, AUTHED)).toBe('failed');
  });

  it('legacy با storage و PROCESSING → processing', () => {
    const legacy = { ...legacyReadyLecture(), processing: { status: 'PROCESSING' } } as Lecture;
    expect(resolveVideoLockReason(legacy, AUTHED)).toBe('processing');
  });
});

describe('hasVideoEvidence / findVideoContentItem (وفادار به sanitize)', () => {
  it('type=video به‌تنهایی شواهد ویدیو نیست', () => {
    expect(hasVideoEvidence(lectureWithoutVideo())).toBe(false);
  });

  it('storage بدون کلید (پس از حذف ضد نشت) شواهد کافی است', () => {
    expect(hasVideoEvidence(legacyReadyLecture())).toBe(true);
  });

  it('contentItem ویدیوییِ دارای فایل شواهد کافی است حتی بدون videoUrl/storage.key', () => {
    expect(hasVideoEvidence(contentItemLecture({ status: 'READY' }))).toBe(true);
  });

  it('درس فقط با contentItem متنی ویدیو ندارد', () => {
    const lecture = {
      _id: 'l4',
      type: 'video',
      resources: [],
      contentItems: [{ _id: 'ci', type: 'rich-text', order: 0, richTextContent: '<p>x</p>' }],
    } as unknown as Lecture;
    expect(hasVideoEvidence(lecture)).toBe(false);
  });

  it('findVideoContentItem آیتم ویدیویی را با وجود sanitize پیدا می‌کند', () => {
    const item = findVideoContentItem(contentItemLecture({ status: 'READY' }));
    expect(item?._id).toBe('ci1');
  });

  it('findVideoContentItem برای درس بدون ویدیو undefined برمی‌گرداند', () => {
    expect(findVideoContentItem(lectureWithoutVideo())).toBeUndefined();
  });
});

describe('applyProcessingStatus', () => {
  it('وضعیت را روی lecture.processing و همه آیتم‌های ویدیو اعمال می‌کند', () => {
    const lecture = contentItemLecture({ status: 'PROCESSING', progress: 10 });
    const next = applyProcessingStatus(lecture, { status: 'READY', progress: 100 });

    expect((next as any).processing.status).toBe('READY');
    const videoItem = (next as any).contentItems.find((i: any) => i.type === 'video');
    expect(videoItem.processing.status).toBe('READY');
    expect(videoItem.processing.progress).toBe(100);
  });

  it('آیتم‌های غیر ویدیو را دست نمی‌زند', () => {
    const lecture = contentItemLecture({ status: 'PROCESSING' });
    const next = applyProcessingStatus(lecture, { status: 'READY', progress: 100 });
    const textItem = (next as any).contentItems.find((i: any) => i.type === 'rich-text');
    expect(textItem.processing).toBeUndefined();
    expect(textItem.richTextContent).toBe('<p>salam</p>');
  });

  it('ورودی را mutate نمی‌کند', () => {
    const lecture = contentItemLecture({ status: 'PROCESSING' });
    applyProcessingStatus(lecture, { status: 'READY', progress: 100 });
    expect((lecture as any).processing.status).toBe('PROCESSING');
    const videoItem = (lecture as any).contentItems.find((i: any) => i.type === 'video');
    expect(videoItem.processing.status).toBe('PROCESSING');
  });

  it('بدون status، همان درس را برمی‌گرداند', () => {
    const lecture = contentItemLecture({ status: 'PROCESSING' });
    expect(applyProcessingStatus(lecture, {})).toBe(lecture);
  });

  it('پس از اعمال READY، دلیل قفل برداشته می‌شود', () => {
    const lecture = contentItemLecture({ status: 'PROCESSING' });
    expect(resolveVideoLockReason(lecture, AUTHED)).toBe('processing');
    const ready = applyProcessingStatus(lecture, { status: 'READY', progress: 100 });
    expect(resolveVideoLockReason(ready, AUTHED)).toBe('none');
    expect(hasVideoEvidence(ready)).toBe(true);
  });
});
