/**
 * ✅ استخراج S3 key از یک فیلد که ممکن است key خام یا URL کامل باشد
 *
 * بین uploadController (پخش/دانلود) و lectureController (ذخیره‌سازی محتوا)
 * مشترک است تا storage.key هرگز از کنار videoUrl ذخیره‌شده گم نشود.
 */
export const extractS3Key = (value: string | undefined | null): string => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const path = url.pathname.replace(/^\/+/, '');
      const bucket = process.env.S3_BUCKET || 'iranian-udemy-videos';
      if (path.startsWith(`${bucket}/`)) {
        return path.substring(bucket.length + 1);
      }
      return path;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
};

/** آیا این URL لینک خام ذخیره‌سازی ابری (S3/Arvan و ...) است؟ */
export const isRawStorageVideoUrl = (url: unknown): boolean => {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return false;
  return /s3\.ir-thr-at1\.arvanstorage\.ir|s3\.[a-z0-9-]+\.amazonaws\.com|storage\.googleapis\.com|backblazeb2\.com|r2\.cloudflarestorage\.com/i.test(
    u,
  );
};
