/**
 * 📥 Video Processor Queue — BullMQ
 *
 * صف پردازش ویدیو برای تبدیل MP4 → HLS و تولید thumbnail.
 * از BullMQ استفاده می‌کند (نه Agenda).
 */

import { Queue, QueueEvents, Job } from 'bullmq';
import Redis from 'ioredis';

// ─── تنظیمات Redis ───
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
};

// اتصال جداگانه برای BullMQ (نیاز به maxRetriesPerRequest: null دارد)
const connection = new Redis(redisConfig);

let redisConnected = false;
let queueInitialized = false;
let videoProcessingQueue: Queue | null = null;
let queueEvents: QueueEvents | null = null;

const QUEUE_NAME = 'video-processing';

/**
 * Initialize the queue lazily when first needed
 */
const initializeQueue = (): Queue => {
  if (queueInitialized) {
    return videoProcessingQueue!;
  }

  queueInitialized = true;

  // Check if Redis is connected
  if (!redisConnected) {
    console.warn('⚠️ [VideoProcessor] Redis در دسترس نیست. صف پردازش ویدیو غیرفعال خواهد بود.');
    return null!;
  }

  try {
    videoProcessingQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400,
          count: 100,
        },
        removeOnFail: {
          age: 604800,
        },
      },
    });

    queueEvents = new QueueEvents(QUEUE_NAME, { connection });

    queueEvents.on('completed', ({ jobId }) => {
      console.log(`✅ [VideoProcessor] Job ${jobId} تکمیل شد`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`❌ [VideoProcessor] Job ${jobId} شکست خورد:`, failedReason);
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      console.log(`📊 [VideoProcessor] Job ${jobId} پیشرفت: ${data}%`);
    });

    console.log('✅ [VideoProcessor] Queue initialized');
  } catch (error) {
    console.error('❌ [VideoProcessor] Failed to initialize queue:', error);
    videoProcessingQueue = null;
  }

  return videoProcessingQueue!;
};

// ─── Event listeners for Redis connection ───
connection.on('connect', () => {
  redisConnected = true;
  console.log('✅ [VideoProcessor] Redis Connected');
  
  // Re-initialize queue if it was previously failed
  if (queueInitialized && !videoProcessingQueue) {
    initializeQueue();
  }
});

connection.on('error', (err: any) => {
  redisConnected = false;
  if (err.code === 'ECONNREFUSED') {
    console.warn('⚠️ [VideoProcessor] Redis در دسترس نیست. صف پردازش ویدیو غیرفعال خواهد بود.');
  }
});

// تلاش برای اتصال اولیه
connection.connect().catch(() => {});

// ─── توابع کمکی ───

/**
 * اضافه کردن job پردازش ویدیو به صف
 *
 * @param contentItemId  هدف آپدت نتیجه (ContentItem سیستم جدید)؛ خالی = مسیر legacy (lecture.processing)
 * @param idempotencyKey شناسه قطعی job برای جلوگیری از صف تکراری هنگام آپلود مجدد/retry
 */
export const addVideoProcessingJob = async (
  lectureId: string,
  storageKey: string,
  bucket: string,
  contentItemId?: string,
  idempotencyKey?: string,
): Promise<string> => {
  const queue = initializeQueue();
  
  if (!queue) {
    throw new Error('Video processing queue is not available (Redis not connected)');
  }

  const job = await queue.add(
    'transcode-hls',
    {
      lectureId,
      storageKey,
      bucket,
      contentItemId,
    },
    {
      priority: 1, // اولویت بالا
      ...(idempotencyKey ? { jobId: idempotencyKey } : {}),
    },
  );

  console.log(
    `📥 [VideoProcessor] Job ${job.id} برای درس ${lectureId}` +
      `${contentItemId ? ` (contentItem=${contentItemId})` : ''} اضافه شد`,
  );
  return job.id!;
};

/**
 * اضافه کردن job تولید thumbnail
 */
export const addThumbnailJob = async (
  lectureId: string,
  storageKey: string,
  bucket: string,
): Promise<string> => {
  const queue = initializeQueue();
  
  if (!queue) {
    throw new Error('Video processing queue is not available (Redis not connected)');
  }

  const job = await queue.add(
    'generate-thumbnails',
    {
      lectureId,
      storageKey,
      bucket,
    },
    {
      priority: 2,
    },
  );

  return job.id!;
};

/**
 * اضافه کردن job پاکسازی فایل‌های ناقص
 */
export const addCleanupJob = async (
  storageKey: string,
  bucket: string,
): Promise<string> => {
  const queue = initializeQueue();
  
  if (!queue) {
    throw new Error('Video processing queue is not available (Redis not connected)');
  }

  const job = await queue.add(
    'cleanup-failed',
    {
      storageKey,
      bucket,
    },
    {
      priority: 3,
    },
  );

  return job.id!;
};

/**
 * دریافت وضعیت job
 */
export const getJobStatus = async (jobId: string) => {
  const queue = initializeQueue();
  
  if (!queue) {
    return null;
  }

  const job = await queue.getJob(jobId);
  if (!job) return null;

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    progress: job.progress,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    state: await job.getState(),
  };
};

export { videoProcessingQueue, connection as redisConnection };
