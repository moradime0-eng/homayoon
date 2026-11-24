/**
 * تست واحد منطق تشخیص وضعیت پردازش ویدیو (بدون MongoDB/Redis)
 *
 * هدف: قرارداد وضعیت‌ها را قفل کنیم تا Classroom هرگز برای ویدیویِ
 * «پردازش‌شده» یا «بدون ویدیو» پیام «در حال آماده‌سازی» نشان ندهد
 * و برعکس، ویدیوی واقعاً در جریان را درست گزارش کند.
 */
import {
  resolveLectureVideoStatus,
  hasLectureVideoFile,
  hasContentItemVideoFile,
  isVideoContentItem,
} from '../utils/videoStatus';

describe('isVideoContentItem / hasContentItemVideoFile', () => {
  it('فقط آیتم‌های نوع video را ویدیو می‌داند', () => {
    expect(isVideoContentItem({ type: 'video' })).toBe(true);
    expect(isVideoContentItem({ type: 'rich-text' })).toBe(false);
    expect(isVideoContentItem(undefined)).toBe(false);
  });

  it('آیتم video بدون فایل (placeholder) فایل ویدیو ندارد', () => {
    expect(hasContentItemVideoFile({ type: 'video', title: 'x' })).toBe(false);
  });

  it('آیتم video با storage.key یا videoFileName فایل دارد', () => {
    expect(
      hasContentItemVideoFile({ type: 'video', storage: { key: 'lectures/a.mp4' } }),
    ).toBe(true);
    expect(hasContentItemVideoFile({ type: 'video', videoFileName: 'a.mp4' })).toBe(true);
    // کلید توسط sanitize حذف می‌شود ولی bucket باقی می‌ماند
    expect(
      hasContentItemVideoFile({ type: 'video', storage: { bucket: 'b' } }),
    ).toBe(true);
  });

  it('آیتم غیر ویدیو حتی با storage فایل ویدیو ندارد', () => {
    expect(
      hasContentItemVideoFile({ type: 'attachment', storage: { key: 'x.pdf' } }),
    ).toBe(false);
  });
});

describe('hasLectureVideoFile', () => {
  it('درس بدون هیچ شواهدی ویدیو ندارد (حتی اگر type آن video باشد)', () => {
    // این همان باگ اصلی بود: type === 'video' به‌تنهایی کافی بود
    expect(hasLectureVideoFile({ type: 'video', processing: { status: 'PENDING' } })).toBe(false);
  });

  it('شواهد legacy (videoFileName / videoFileSize / videoThumbnail) کافی است', () => {
    expect(hasLectureVideoFile({ type: 'video', videoFileName: 'a.mp4' })).toBe(true);
    expect(hasLectureVideoFile({ type: 'video', videoFileSize: 1024 })).toBe(true);
    expect(hasLectureVideoFile({ type: 'video', videoThumbnail: 't.jpg' })).toBe(true);
  });

  it('storage بدون کلید (پس از sanitize) هم شواهد معتبر است', () => {
    expect(
      hasLectureVideoFile({ type: 'video', storage: { provider: 'arvan', bucket: 'b' } }),
    ).toBe(true);
  });

  it('درس با contentItem ویدیوییِ دارای فایل ویدیو دارد', () => {
    expect(
      hasLectureVideoFile({
        type: 'article',
        contentItems: [{ type: 'video', videoFileName: 'a.mp4' }],
      }),
    ).toBe(true);
  });

  it('درس فقط با contentItem متنی ویدیو ندارد', () => {
    expect(
      hasLectureVideoFile({
        type: 'video',
        contentItems: [{ type: 'rich-text', richTextContent: '<p>x</p>' }],
      }),
    ).toBe(false);
  });
});

describe('resolveLectureVideoStatus', () => {
  it('درسِ بدون ویدیو نباید PROCESSING یا PENDINGِ گمراه‌کننده بدهد که «در جریان» تفسیر شود', () => {
    const s = resolveLectureVideoStatus({ type: 'video', processing: { status: 'PENDING' } });
    expect(s.status).toBe('PENDING');
    expect(s.progress).toBe(0);
  });

  it('اولویت با ContentItemهای ویدیویی دارای فایل است', () => {
    const lecture = {
      processing: { status: 'PENDING' },
      contentItems: [
        { type: 'video', storage: { key: 'a.mp4' }, processing: { status: 'PROCESSING', progress: 40 } },
      ],
    };
    expect(resolveLectureVideoStatus(lecture)).toEqual({ status: 'PROCESSING', progress: 40, error: undefined });
  });

  it('وقتی همه ویدیوها پردازش شده‌اند → READY با progress 100', () => {
    const lecture = {
      processing: { status: 'PROCESSING' },
      contentItems: [
        { type: 'video', storage: { key: 'a.mp4' }, processing: { status: 'READY', progress: 100 } },
      ],
    };
    expect(resolveLectureVideoStatus(lecture).status).toBe('READY');
    expect(resolveLectureVideoStatus(lecture).progress).toBe(100);
  });

  it('خطای یکی از ویدیوها مقدم است', () => {
    const lecture = {
      contentItems: [
        { type: 'video', storage: { key: 'a.mp4' }, processing: { status: 'READY' } },
        { type: 'video', storage: { key: 'b.mp4' }, processing: { status: 'FAILED', error: 'FFmpeg missing', progress: 0 } },
      ],
    };
    const s = resolveLectureVideoStatus(lecture);
    expect(s.status).toBe('FAILED');
    expect(s.error).toBe('FFmpeg missing');
  });

  it('آیتم‌های placeholder (بدون فایل) در تجمیع نادیده گرفته می‌شوند', () => {
    const lecture = {
      processing: { status: 'READY', progress: 100 },
      contentItems: [{ type: 'video', processing: { status: 'PENDING' } }],
    };
    // فایلی وجود ندارد → به وضعیت legacy رجوع می‌شود
    expect(resolveLectureVideoStatus(lecture).status).toBe('READY');
  });

  it('درس legacy با وضعیت FAILED دلیل خطا را برمی‌گرداند', () => {
    const s = resolveLectureVideoStatus({
      storage: { key: 'a.mp4' },
      processing: { status: 'FAILED', error: 'boom' },
    });
    expect(s.status).toBe('FAILED');
    expect(s.error).toBe('boom');
  });

  it('بدون processing (داده‌های قدیمی) → PENDING پیش‌فرض', () => {
    expect(resolveLectureVideoStatus({}).status).toBe('PENDING');
  });
});
