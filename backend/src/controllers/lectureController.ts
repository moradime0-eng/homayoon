/**
 * 📖 Lecture Controller — CRUD operations for lectures within sections
 *
 * Lectures are now a separate collection (not embedded in Course).
 * Each lecture belongs to a section and a course.
 *
 * ✅ FIX: contentItems از updateLecture حذف شد تا اعتبارسنجی دور زده نشود.
 *         برای مدیریت contentItems حتماً از endpoint های اختصاصی استفاده کنید:
 *         - POST   /lectures/:id/content-items              → addContentItem
 *         - PUT    /lectures/:id/content-items/:contentItemId → updateContentItem
 *         - DELETE /lectures/:id/content-items/:contentItemId → deleteContentItem
 *         - PUT    /lectures/:id/content-items/reorder      → reorderContentItems
 *
 * ✅ FIX v2: updateContentItem — validation هوشمند.
 *         اگر فقط title/order/description آپدیت شود → validation فایل skip.
 *         اگر داده فایلی جدید (storage.key / URL غیرخالی) ارسال شود → validation سخت.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Lecture from '../models/Lecture';
import Section from '../models/Section';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { LectureType } from '../enums/LectureType';
import { recalculateCourseStats } from './sectionController';
import { sanitizeLectureMedia } from '../utils/mediaGuard';
import { isExactOrder } from '../utils/orderValidation';
import { courseAccess, visibleLecture } from '../utils/courseAccess';
import { extractS3Key, isRawStorageVideoUrl } from '../utils/storageKey';
import { addVideoProcessingJob } from '../queues/videoProcessor.queue';
import { createHash } from 'crypto';
import {
  safeDeleteLectureS3Files,
  safeDeleteContentItemS3Files,
} from '../services/safeFileDeletionService';

/**
 * Recalculate section stats (totalLectures, totalDuration) after lecture changes.
 */
const recalculateSectionStats = async (sectionId: string): Promise<void> => {
  const lectures = await Lecture.find({ section: sectionId }).lean();
  const totalLectures = lectures.length;
  const totalDuration = lectures.reduce((sum, l) => sum + (l.duration || 0), 0);
  await Section.findByIdAndUpdate(sectionId, { totalLectures, totalDuration });
};

/**
 * Verify that the current user owns this course (or is admin).
 */
const verifyCourseOwnership = async (courseId: string, userId: string, userRole: string) => {
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('دوره یافت نشد');
  if (course.instructor.toString() !== userId && userRole !== 'admin') {
    throw ApiError.forbidden('شما اجازه ویرایش این دوره را ندارید');
  }
  return course;
};

/**
 * ✅ التیام داده هنگام ذخیره‌سازی: اگر videoUrl خام ذخیره‌سازی بدون storage.key
 * (نتیجهٔ مسیرهای آپلود/ذخیره ناهماهنگ) در سند نوشته شود، key از روی URL استخراج
 * می‌شود و اگر ویدیو هرگز پردازش نشده، job پردازش واقعی صف می‌شود — تا وضعیت
 * PENDING ابدی و پیام «در حال آماده‌سازی» برای ویدیوی موجود رخ ندهد.
 *
 * دو حالت:
 *  ۱) key وجود ندارد ولی videoUrl خام ذخیره‌سازی است → key استخراج و job صف می‌شود.
 *  ۲) key از قبل موجود است ولی وضعیت هرگز شروع نشده (PENDING/UPLOADING) → job صف می‌شود.
 *     (فقط برای contentItem ویدیویی؛ وضعیت‌های PROCESSING/FAILED/READY دست نمی‌خورند)
 */
const healVideoStorageAndQueue = async (
  lecture: any,
  target: any,
  videoUrl: unknown,
  contentItemId?: string,
): Promise<void> => {
  if (!isRawStorageVideoUrl(videoUrl) && !target.storage?.key) return;

  const proc0 = target.processing;
  const isReady0 =
    proc0?.status === 'READY' &&
    Array.isArray(proc0?.hls?.qualities) &&
    proc0.hls.qualities.length > 0;
  if (isReady0) return; // فقط key برگردانده شد؛ پردازش نهایی شده

  let key = target.storage?.key as string | undefined;

  if (!key) {
    key = extractS3Key(typeof videoUrl === 'string' ? videoUrl : '');
    if (!key || /^https?:/i.test(key)) return; // استخراج ممکن نشد → دست نمی‌زنیم

    const bucket = process.env.S3_BUCKET || 'iranian-udemy-videos';
    target.storage = {
      ...(target.storage || {}),
      provider: target.storage?.provider || 'arvan',
      bucket,
      key,
      originalFileName: target.storage?.originalFileName || key.split('/').pop() || '',
    };
  } else {
    // 🔁 کلید از قبل موجود است؛ فقط وقتی ادامه می‌دهیم که پردازش «هرگز» شروع نشده باشد
    // (PENDING پیش‌فرض اسکیما / UPLOADING) — یعنی هیچ job ای صف نشده و وضعیت برای همیشه
    // PENDING می‌ماند. وضعیت‌های PROCESSING/FAILED/READY را دست نمی‌زنیم تا job تکراری
    // یا بازنویسی خطای صادقانه رخ ندهد.
    //
    // ⚠️ فقط برای contentItem ویدیویی: در مسیر legacy، `lecture.storage` برای فایل‌های
    // غیر ویدیویی (resource/attachment) هم نوشته می‌شود و نباید برایشان job ویدیو صف شود.
    const status = proc0?.status;
    const neverStarted = !status || status === 'PENDING' || status === 'UPLOADING';
    if (!contentItemId || !neverStarted) return;
  }

  const bucket = process.env.S3_BUCKET || 'iranian-udemy-videos';

  const jobId = `video-${lecture._id.toString()}-${contentItemId || 'legacy'}-${createHash('sha1')
    .update(key)
    .digest('hex')
    .slice(0, 16)}`;
  try {
    await addVideoProcessingJob(lecture._id.toString(), key, bucket, contentItemId, jobId);
    console.log(
      `📥 [healVideoStorage] job پردازش صف شد: lecture=${lecture._id}` +
        `${contentItemId ? ` contentItem=${contentItemId}` : ''} key=${key}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطای ناشناخته صف';
    console.error('❌ [healVideoStorage] صف پردازش در دسترس نیست:', message);
    target.processing = {
      ...(target.processing || {}),
      status: 'FAILED',
      progress: 0,
      error: `صف پردازش در دسترس نیست: ${message}`.slice(0, 1000),
      completedAt: new Date(),
    };
  }
};

// ==================== CREATE LECTURE ====================
export const createLecture = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId } = req.params;
  const {
    title,
    type,
    duration,
    isFreePreview,
    content,
    videoUrl,
    videoPublicId,
    videoFileName,
    videoFileSize,
    fileUrl,
    fileName,
    fileSize,
  } = req.body;

  // Verify section belongs to course
  const section = await Section.findOne({ _id: sectionId, course: courseId });
  if (!section) throw ApiError.notFound('فصل یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  // Determine order: append at end
  const lastLecture = await Lecture.findOne({ section: sectionId }).sort({ order: -1 }).lean();
  const order = lastLecture ? lastLecture.order + 1 : 0;

  const lecture = await Lecture.create({
    section: sectionId,
    course: courseId,
    title: title?.trim() || 'درس جدید',
    type: type || LectureType.VIDEO,
    duration: duration || 0,
    isFreePreview: isFreePreview || false,
    content,
    videoUrl,
    videoPublicId,
    videoFileName,
    videoFileSize,
    fileUrl,
    fileName,
    fileSize,
    order,
  });

  // ✅ FIX: مسیر ایجاد درس هم باید التیام/صف پردازش را انجام دهد (قبلاً فقط updateLecture این کار را می‌کرد)
  // بدون این، درسی که ویدیویش هنگام ایجاد ثبت شود برای همیشه processing.status=PENDING
  // می‌ماند و دانشجو در Classroom پیام «در حال آماده‌سازی» را برای ویدیوی موجود می‌دید.
  await healVideoStorageAndQueue(lecture, lecture, lecture.videoUrl);
  await lecture.save();

  await recalculateSectionStats(sectionId);
  await recalculateCourseStats(courseId);

  return ApiResponse.created(res, lecture, 'درس با موفقیت ایجاد شد');
});

// ==================== LIST LECTURES ====================
export const listLectures = asyncHandler(async (req: Request, res: Response) => {
  const { sectionId, courseId } = req.params;

  const section = await Section.findOne({ _id: sectionId, course: courseId });
  if (!section) throw ApiError.notFound('فصل یافت نشد');

  const access = await courseAccess(req, courseId);
  const lectures = await Lecture.find({ section: sectionId, course: courseId }).sort({ order: 1 }).lean();
  return ApiResponse.success(res, lectures.map((l) => visibleLecture(l, access)).filter(Boolean).map((l) => access.manager ? l : sanitizeLectureMedia(l)));
});

// ==================== LIST ALL COURSE LECTURES (flat) ====================
export const listAllCourseLectures = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  const access = await courseAccess(req, courseId);
  const lectures = await Lecture.find({ course: courseId })
    .sort({ order: 1 })
    .populate('section', 'title order')
    .lean();
  return ApiResponse.success(res, lectures.map((l) => visibleLecture(l, access)).filter(Boolean).map((l) => access.manager ? l : sanitizeLectureMedia(l)));
});

// ==================== UPDATE LECTURE ====================
/**
 * ⚠️ IMPORTANT: contentItems از این endpoint قابل آپدیت نیست!
 * برای افزودن/ویرایش/حذف contentItems از endpoint های اختصاصی زیر استفاده کنید:
 *   - POST   /content-items
 *   - PUT    /content-items/:contentItemId
 *   - DELETE /content-items/:contentItemId
 * این محدودیت برای جلوگیری از دور زدن validateContentItem() است.
 */
export const updateLecture = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId, lectureId } = req.params;

  const lecture = await Lecture.findOne({ _id: lectureId, section: sectionId, course: courseId });
  if (!lecture) throw ApiError.notFound('درس یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  // ✅ FIX: 'contentItems' از لیست حذف شد
  const allowedFields = [
    'title', 'type', 'duration', 'isFreePreview', 'isPublished',
    'content', 'videoUrl', 'videoPublicId', 'videoFileName', 'videoFileSize',
    'videoThumbnail', 'articleContent', 'fileUrl', 'fileName', 'fileSize', 'order',
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      (lecture as any)[field] = req.body[field];
    }
  }

  // ✅ اخطار به توسعه‌دهنده در صورت تلاش برای آپدیت contentItems
  if (req.body.contentItems !== undefined) {
    console.warn(
      `⚠️ [updateLecture] تلاش برای آپدیت contentItems از طریق updateLecture رد شد. ` +
      `از endpoint اختصاصی استفاده کنید. lectureId=${lectureId}`
    );
  }

  // ✅ التیام داده: videoUrl خام بدون storage.key → استخراج key و صف پردازش واقعی
  await healVideoStorageAndQueue(lecture, lecture, lecture.videoUrl);

  await lecture.save();
  await recalculateSectionStats(sectionId);
  await recalculateCourseStats(courseId);

  return ApiResponse.success(res, lecture, 'درس با موفقیت بروزرسانی شد');
});

// ==================== DELETE LECTURE ====================
export const deleteLecture = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId, lectureId } = req.params;

  const lecture = await Lecture.findOne({ _id: lectureId, section: sectionId, course: courseId });
  if (!lecture) throw ApiError.notFound('درس یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  // ابتدا کلیدهای S3 استخراج و ثبت شوند (قبل از حذف رکورد)
  const { deleted, failed } = await safeDeleteLectureS3Files(lectureId);

  // سپس عملیات دیتابیس انجام شود
  await Lecture.findByIdAndDelete(lectureId);
  await recalculateSectionStats(sectionId);
  await recalculateCourseStats(courseId);

  if (failed.length > 0) {
    console.warn(`⚠️ Some S3 files could not be deleted for lecture ${lectureId}:`, failed);
  }

  return ApiResponse.success(res, null, 'درس با موفقیت حذف شد');
});

// ==================== REORDER LECTURES ====================
export const reorderLectures = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId } = req.params;
  const { lectureIds } = req.body;

  if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
    throw ApiError.badRequest('لیست ترتیب دروس الزامی است');
  }

  const section = await Section.findOne({ _id: sectionId, course: courseId });
  if (!section) throw ApiError.notFound('فصل یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  const existingLectures = await Lecture.find({ section: sectionId, course: courseId }).select('_id').lean();
  if (!isExactOrder(lectureIds, existingLectures.map((item) => item._id.toString()))) {
    throw ApiError.badRequest('لیست دروس باید شامل همه دروس همین فصل و بدون تکرار باشد');
  }

  const bulkOps = lectureIds.map((id: string, index: number) => ({
    updateOne: {
      filter: { _id: id, section: sectionId, course: courseId },
      update: { $set: { order: index } },
    },
  }));

  await Lecture.bulkWrite(bulkOps);

  const lectures = await Lecture.find({ section: sectionId }).sort({ order: 1 }).lean();
  return ApiResponse.success(res, lectures, 'ترتیب دروس با موفقیت بروزرسانی شد');
});

// ==================== CONTENT ITEMS CRUD ====================

/**
 * Add a content item to a lecture
 * ✅ این تنها راه صحیح برای افزودن contentItem جدید است.
 *
 * ✅ FIX: پشتیبانی از Placeholder Mode
 *   فرانت‌اند الگوی create → upload → update دارد:
 *   1. ابتدا contentItem خالی ساخته می‌شود (placeholder)
 *   2. سپس فایل آپلود می‌شود (proxyUpload)
 *   3. سپس contentItem با storage.key آپدیت می‌شود
 *
 *   بنابراین اگر type فایلی است ولی هیچ داده فایلی ارسال نشده،
 *   اجازه ساخت placeholder می‌دهیم.
 */
export const addContentItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId, lectureId } = req.params;
  const { type, title, description, order, ...typeSpecificData } = req.body;

  const lecture = await Lecture.findOne({ _id: lectureId, section: sectionId, course: courseId });
  if (!lecture) throw ApiError.notFound('درس یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  // Validate content item type
  const validTypes = ['video', 'rich-text', 'attachment', 'external-link', 'image', 'audio'];
  if (!validTypes.includes(type)) {
    throw ApiError.badRequest('نوع محتوای نامعتبر است');
  }

  // ─── تشخیص Placeholder Mode ───
  // آیا فرانت‌اند هیچ فیلد فایلی غیرخالی ارسال کرده؟
  // ✅ FIX: رشته‌های خالی هم «غیرفعال» حساب می‌شوند تا ارسال
  // videoUrl: '' / fileName: '' باعث فعال شدن validation سخت نشود
  const nonEmpty = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';
  const fileTypes = ['video', 'image', 'audio', 'attachment'];
  const hasAnyFileField =
    nonEmpty(typeSpecificData.videoUrl) ||
    nonEmpty(typeSpecificData.imageUrl) ||
    nonEmpty(typeSpecificData.fileUrl) ||
    nonEmpty(typeSpecificData.audioUrl) ||
    (typeSpecificData.storage !== undefined && nonEmpty(typeSpecificData.storage?.key)) ||
    nonEmpty(typeSpecificData.fileName);

  const isPlaceholder = fileTypes.includes(type) && !hasAnyFileField;

  // ─── Validation ───
  if (!isPlaceholder) {
    // حالت عادی: داده فایلی ارسال شده → validation سخت
    const validationErrors = validateContentItem(type, typeSpecificData);
    if (validationErrors.length > 0) {
      throw ApiError.badRequest(validationErrors.join(', '));
    }
  }
  // حالت placeholder: بدون validation فایل → بعداً با PUT + آپلود پر می‌شود

  // Determine order
  const itemOrder = order !== undefined ? order : (lecture.contentItems?.length || 0);

  const contentItem = {
    _id: new mongoose.Types.ObjectId(),
    type,
    title: title?.trim() || 'محتوای جدید',
    description: description?.trim() || '',
    order: itemOrder,
    ...typeSpecificData,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // ✅ التیام داده: videoUrl خام بدون storage.key → استخراج key و صف پردازش واقعی
  if (contentItem.type === 'video') {
    await healVideoStorageAndQueue(lecture, contentItem, contentItem.videoUrl, String(contentItem._id));
  }

  lecture.contentItems = lecture.contentItems || [];
  lecture.contentItems.push(contentItem);
  lecture.markModified('contentItems');
  await lecture.save();

  if (isPlaceholder) {
    console.log(
      `📝 [addContentItem] placeholder ساخته شد: type=${type}, ` +
      `contentItemId=${contentItem._id}, lectureId=${lectureId} ` +
      `(منتظر آپلود فایل و آپدیت storage.key)`
    );
  }

  return ApiResponse.created(res, contentItem, 'محتوا با موفقیت اضافه شد');
});
/**
 * Update a content item
 * ✅ این تنها راه صحیح برای ویرایش contentItem (شامل آپدیت storage/imageUrl و ...) است.
 *
 * ✅ FIX v2: Validation هوشمند
 *   - اگر فقط title / order / description آپدیت شود → validation فایل skip
 *   - اگر داده فایلی جدید (storage.key غیرخالی / URL غیرخالی) ارسال شود → validation سخت
 *   - اگر type تغییر کند → validation سخت
 */
export const updateContentItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId, lectureId, contentItemId } = req.params;
  const { type, title, description, order, ...typeSpecificData } = req.body;

  const lecture = await Lecture.findOne({ _id: lectureId, section: sectionId, course: courseId });
  if (!lecture) throw ApiError.notFound('درس یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  const contentItem = lecture.contentItems?.find(
    (item: any) => item._id.toString() === contentItemId
  );
  if (!contentItem) throw ApiError.notFound('محتوا یافت نشد');

  // ─── ۱. بررسی تغییر type ───
  const typeChanged = type !== undefined && type !== contentItem.type;
  if (typeChanged) {
    const validTypes = ['video', 'rich-text', 'attachment', 'external-link', 'image', 'audio'];
    if (!validTypes.includes(type)) {
      throw ApiError.badRequest('نوع محتوای نامعتبر است');
    }
  }

  // ─── ۲. تشخیص اینکه آیا داده فایلی جدید و غیرخالی ارسال شده ───
  const hasNewFileData =
    (typeSpecificData.videoUrl && String(typeSpecificData.videoUrl).trim() !== '') ||
    (typeSpecificData.imageUrl && String(typeSpecificData.imageUrl).trim() !== '') ||
    (typeSpecificData.fileUrl && String(typeSpecificData.fileUrl).trim() !== '') ||
    (typeSpecificData.audioUrl && String(typeSpecificData.audioUrl).trim() !== '') ||
    (typeSpecificData.storage?.key && String(typeSpecificData.storage.key).trim() !== '');

const needsValidation = hasNewFileData || typeChanged || typeSpecificData.richTextContent !== undefined || typeSpecificData.externalUrl !== undefined;
  // ─── ۳. اعمال تغییرات فیلدهای متنی ───
  if (title !== undefined) contentItem.title = title?.trim() || contentItem.title;
  if (description !== undefined) contentItem.description = description?.trim() || '';
  if (order !== undefined) contentItem.order = order;
  if (typeChanged) contentItem.type = type;

  // ─── ۴. اعمال تغییرات فیلدهای type-specific ───
  Object.keys(typeSpecificData).forEach((key) => {
    if (typeSpecificData[key] !== undefined) {
      (contentItem as any)[key] = typeSpecificData[key];
    }
  });

  // ✅ التیام داده: videoUrl خام بدون storage.key → استخراج key و صف پردازش واقعی
  if (contentItem.type === 'video') {
    await healVideoStorageAndQueue(lecture, contentItem, contentItem.videoUrl, contentItemId);
  }

  // ─── ۵. Validation فقط وقتی لازم باشد ───
  if (needsValidation) {
    const effectiveType = typeChanged ? type : contentItem.type;
    const contentItemObj = (contentItem as any).toObject
      ? (contentItem as any).toObject()
      : { ...contentItem };
    const mergedData = { ...contentItemObj, ...typeSpecificData };
    const validationErrors = validateContentItem(effectiveType, mergedData);
    if (validationErrors.length > 0) {
      throw ApiError.badRequest(validationErrors.join(', '));
    }
  }

  contentItem.updatedAt = new Date();

  // ✅ mark nested changes so Mongoose persists them
  lecture.markModified('contentItems');
  await lecture.save();

  return ApiResponse.success(res, contentItem, 'محتوا با موفقیت بروزرسانی شد');
});
/**
 * Delete a content item
 */
export const deleteContentItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId, lectureId, contentItemId } = req.params;

  const lecture = await Lecture.findOne({ _id: lectureId, section: sectionId, course: courseId });
  if (!lecture) throw ApiError.notFound('درس یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  const itemIndex = lecture.contentItems?.findIndex(
    (item: any) => item._id.toString() === contentItemId
  );
  if (itemIndex === undefined || itemIndex === -1) {
    throw ApiError.notFound('محتوا یافت نشد');
  }

  // ابتدا کلیدهای S3 استخراج و ثبت شوند (قبل از حذف رکورد)
  const { deleted, failed } = await safeDeleteContentItemS3Files(lectureId, contentItemId);

  // سپس رکورد دیتابیس حذف شود
  lecture.contentItems.splice(itemIndex, 1);
  await lecture.save();

  if (failed.length > 0) {
    console.warn(
      `⚠️ Some S3 files could not be deleted for content item ${contentItemId}:`,
      failed
    );
  }

  return ApiResponse.success(res, null, 'محتوا با موفقیت حذف شد');
});

/**
 * Reorder content items within a lecture
 */
export const reorderContentItems = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId, lectureId } = req.params;
  const { contentItemIds } = req.body;

  if (!Array.isArray(contentItemIds) || contentItemIds.length === 0) {
    throw ApiError.badRequest('لیست ترتیب محتوا الزامی است');
  }

  const lecture = await Lecture.findOne({ _id: lectureId, section: sectionId, course: courseId });
  if (!lecture) throw ApiError.notFound('درس یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  const lectureItemIds =
    lecture.contentItems?.map((item: any) => item._id.toString()) || [];
  const allValid = isExactOrder(contentItemIds, lectureItemIds);
  if (!allValid) {
    throw ApiError.badRequest('یک یا چند شناسه محتوا متعلق به این درس نیست');
  }

  const reorderedItems = contentItemIds
    .map((id: string, index: number) => {
      const item = lecture.contentItems?.find(
        (ci: any) => ci._id.toString() === id
      );
      if (item) {
        item.order = index;
        item.updatedAt = new Date();
        return item;
      }
      return null;
    })
    .filter((item): item is any => item !== null);

  lecture.contentItems = reorderedItems;
  lecture.markModified('contentItems');
  await lecture.save();

  return ApiResponse.success(
    res,
    lecture.contentItems,
    'ترتیب محتوا با موفقیت بروزرسانی شد'
  );
});

/**
 * Validate content item based on type
 * ⚠️ این تابع فقط زمانی صدا زده می‌شود که داده فایلی جدید ارسال شده باشد.
 */
function validateContentItem(type: string, data: any): string[] {
  const errors: string[] = [];

  switch (type) {
    case 'video':
      if (!data.videoUrl && !data.storage?.key) {
        errors.push('برای محتوای ویدیو، videoUrl یا storage.key الزامی است');
      }
      break;
    case 'rich-text':
      if (!data.richTextContent || !data.richTextContent.trim()) {
        errors.push('برای محتوای متنی، richTextContent الزامی است');
      }
      break;
    case 'attachment':
      if (!data.fileUrl && !data.storage?.key) {
        errors.push('برای فایل ضمیمه، fileUrl یا storage.key الزامی است');
      }
      if (!data.fileName) {
        errors.push('برای فایل ضمیمه، fileName الزامی است');
      }
      break;
    case 'external-link':
      if (!data.externalUrl) {
        errors.push('برای لینک خارجی، externalUrl الزامی است');
      } else {
        try {
          const url = new URL(data.externalUrl);
          const allowedProtocols = ['http:', 'https:'];
          if (!allowedProtocols.includes(url.protocol)) {
            errors.push('فقط لینک‌های http و https مجاز هستند');
          }
          if (url.protocol === 'javascript:' || url.protocol === 'data:') {
            errors.push('بروتوکول لینک نامعتبر است');
          }
        } catch {
          errors.push('لینک خارجی معتبر نیست');
        }
      }
      break;
    case 'image':
      if (!data.imageUrl && !data.storage?.key) {
        errors.push('برای تصویر، imageUrl یا storage.key الزامی است');
      }
      break;
    case 'audio':
      if (!data.audioUrl && !data.storage?.key) {
        errors.push('برای فایل صوتی، audioUrl یا storage.key الزامی است');
      }
      break;
  }

  return errors;
}

/**
 * Move a lecture to another section within the same course
 */
export const moveLectureToSection = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId, lectureId } = req.params;
  const { targetSectionId } = req.body;

  if (!targetSectionId) {
    throw ApiError.badRequest('شناسه فصل مقصد الزامی است');
  }

  if (!mongoose.Types.ObjectId.isValid(lectureId)) {
    throw ApiError.badRequest('شناسه درس نامعتبر است');
  }
  if (!mongoose.Types.ObjectId.isValid(sectionId)) {
    throw ApiError.badRequest('شناسه فصل مبدأ نامعتبر است');
  }
  if (!mongoose.Types.ObjectId.isValid(targetSectionId)) {
    throw ApiError.badRequest('شناسه فصل مقصد نامعتبر است');
  }

  if (sectionId === targetSectionId) {
    const lecture = await Lecture.findOne({
      _id: lectureId,
      section: sectionId,
      course: courseId,
    });
    if (!lecture) throw ApiError.notFound('درس یافت نشد');
    await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);
    return ApiResponse.success(res, lecture, 'درس در همان فصل باقی می‌ماند');
  }

  const lecture = await Lecture.findOne({
    _id: lectureId,
    section: sectionId,
    course: courseId,
  });
  if (!lecture) throw ApiError.notFound('درس یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  const targetSection = await Section.findOne({
    _id: targetSectionId,
    course: courseId,
  });
  if (!targetSection) throw ApiError.notFound('فصل مقصد یافت نشد');

  const lastLecture = await Lecture.findOne({ section: targetSectionId })
    .sort({ order: -1 })
    .lean();
  const newOrder = lastLecture ? lastLecture.order + 1 : 0;

  lecture.section = targetSectionId;
  lecture.order = newOrder;
  await lecture.save();

  await recalculateSectionStats(sectionId);
  await recalculateSectionStats(targetSectionId);
  await recalculateCourseStats(courseId);

  return ApiResponse.success(res, lecture, 'درس با موفقیت به فصل جدید منتقل شد');
});