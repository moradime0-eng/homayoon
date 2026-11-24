/**
 * 🎬 Video Processor Worker — FFmpeg HLS Transcoding
 *
 * Worker BullMQ که فایل‌های ویدیو را از S3 دانلود،
 * به HLS (سه کیفیت) تبدیل و thumbnail تولید می‌کند.
 *
 * Architecture:
 *   S3 (source MP4) → Stream to disk → FFmpeg spawn → HLS segments + thumbnails
 *   → Stream upload to S3 → Update MongoDB → Cleanup temp dir
 *
 * Memory-safe: Uses streams for S3 download/upload, never loads full file into RAM.
 * Security: Uses spawn() with argument arrays (no shell injection).
 * Idempotent: Checks processing status before starting.
 */

import { Worker, Job } from 'bullmq';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import Lecture from '../models/Lecture';
import { redisConnection } from '../queues/videoProcessor.queue';
import { extractDurationFromFile, checkFFmpegAvailable } from '../utils/videoMetadata';

// ─── Configuration ───
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const TEMP_BASE = process.env.TEMP_DIR || process.env.VIDEO_TEMP_DIR || '/home/app/scratch';
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

// ─── S3 Client (singleton) ───
let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'https://s3.ir-thr-at1.arvanstorage.ir',
      region: process.env.S3_REGION || 'ir-thr-at1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
  }
  return _s3Client;
}

// ─── HLS Quality Presets ───
const HLS_QUALITIES = [
  {
    name: '1080p',
    bitrate: '5000k',
    maxrate: '5350k',
    bufsize: '7500k',
    resolution: '1920:1080',
    // ✅ FIX: scale و pad باید دو فیلتر جداگانه با کاما (,) جدا شوند
    // scale: مقیاس‌دهی با حفظ نسبت ابعاد، pad: اضافه کردن حاشیه برای ابعاد دقیق زوج
    scaleFilter:
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
  },
  {
    name: '720p',
    bitrate: '2500k',
    maxrate: '2650k',
    bufsize: '3750k',
    resolution: '1280:720',
    scaleFilter:
      "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
  },
  {
    name: '480p',
    bitrate: '1000k',
    maxrate: '1050k',
    bufsize: '1500k',
    resolution: '854:480',
    scaleFilter:
      "scale='min(854,iw)':'min(480,ih)':force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2",
  },
];
const SEGMENT_DURATION = 10;

// ─── Path Traversal Guard ───
function sanitizeStorageKey(key: string): void {
  if (key.includes('..') || key.includes('//') || key.startsWith('/')) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  if (!/^[a-zA-Z0-9._\-\/]+$/.test(key)) {
    throw new Error(`Storage key contains invalid characters: ${key}`);
  }
}

// ─── Temp Directory ───
function createJobTempDir(jobId: string): string {
  const tmpDir = path.join(TEMP_BASE, `video-${jobId}`);
  fs.mkdirSync(path.join(tmpDir, 'hls'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'thumbs'), { recursive: true });
  return tmpDir;
}

function cleanupTempDir(tmpDir: string): void {
  try {
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// ─── S3 Stream Download (Memory-Safe) ───
async function downloadFromS3(key: string, localPath: string): Promise<void> {
  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET || 'iranian-udemy-videos',
    Key: key,
  });
  const response = await s3.send(command);
  if (!response.Body) throw new Error('S3 response body is empty');

  const fileStream = fs.createWriteStream(localPath);
  const body = response.Body as any;

  // ✅ FIX: AWS SDK v3 Body می‌تواند یکی از موارد زیر باشد:
  // 1. Node.js Readable stream (با متد pipe)
  // 2. WHATWG ReadableStream (بدون pipe، مستقیم قابل استفاده با Readable.fromWeb)
  // 3. Blob (در محیط‌های مرورگر)
  // بررسی صحیح نوع استریم برای جلوگیری از خطای "nodeStream.pipe is not a function"
  let source: Readable;
  
  // اگر Node.js Readable stream است (متد pipe دارد)
  if (body && typeof body.pipe === 'function' && typeof body.on === 'function') {
    source = body as Readable;
  }
  // اگر WHATWG ReadableStream است (Symbol.asyncIterator دارد)
  else if (body && typeof body[Symbol.asyncIterator] === 'function') {
    source = Readable.fromWeb(body as any);
  }
  // اگر transformToWebStream دارد (SDK قدیمی‌تر)
  else if (body && typeof body.transformToWebStream === 'function') {
    const webStream = body.transformToWebStream();
    source = Readable.fromWeb(webStream as any);
  }
  // Blob یا موارد دیگر
  else if (body && typeof body.arrayBuffer === 'function') {
    const buffer = await body.arrayBuffer();
    source = Readable.from(Buffer.from(buffer));
  }
  else {
    throw new Error(`Unsupported S3 response body type: ${typeof body}`);
  }

  await pipeline(source, fileStream);
}

// ─── S3 Stream Upload (Memory-Safe) ───
async function uploadFileToS3(localPath: string, key: string, contentType: string): Promise<void> {
  const s3 = getS3Client();
  const fileStream = fs.createReadStream(localPath);
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET || 'iranian-udemy-videos',
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });
  await s3.send(command);
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.m3u8': 'application/x-mpegURL',
    '.ts': 'video/mp2t',
    '.mp4': 'video/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  return types[ext] || 'application/octet-stream';
}

// ─── FFmpeg Spawn (No Shell Injection) ───
function runFFmpeg(
  args: string[],
  timeoutMs: number = JOB_TIMEOUT_MS,
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(FFMPEG_PATH, args, {
      timeout: timeoutMs,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stderr });
    });
    child.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}

// ─── HLS Transcoding ───
async function transcodeToHLS(
  inputPath: string,
  outputDir: string,
): Promise<{ qualities: string[]; masterPlaylist: string }> {
  const qualities: string[] = [];

  for (const quality of HLS_QUALITIES) {
    const outputPlaylist = path.join(outputDir, `index_${quality.name}.m3u8`);
    const segmentPattern = path.join(outputDir, `segment_${quality.name}_%03d.ts`);

    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-i',
      inputPath,
      '-vf',
      quality.scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-b:v',
      quality.bitrate,
      '-maxrate',
      quality.maxrate,
      '-bufsize',
      quality.bufsize,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-hls_time',
      String(SEGMENT_DURATION),
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      segmentPattern,
      '-f',
      'hls',
      outputPlaylist,
    ];

    console.log(`🔄 [Worker] Transcoding ${quality.name}...`);
    const result = await runFFmpeg(args);

    if (result.exitCode !== 0) {
      throw new Error(`FFmpeg failed for ${quality.name}: ${result.stderr.slice(0, 500)}`);
    }
    qualities.push(quality.name);
  }

  // Master Playlist
  const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
  let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
  for (const quality of HLS_QUALITIES) {
    if (qualities.includes(quality.name)) {
      const bandwidth = parseInt(quality.bitrate.replace('k', '')) * 1000;
      const avgBw = Math.round(bandwidth * 0.8);
      const [w, h] = quality.resolution.split(':');
      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AVERAGE-BANDWIDTH=${avgBw},RESOLUTION=${w}x${h}\n`;
      masterContent += `index_${quality.name}.m3u8\n\n`;
    }
  }
  fs.writeFileSync(masterPlaylistPath, masterContent);
  return { qualities, masterPlaylist: 'master.m3u8' };
}

// ─── Thumbnail Generation ───
async function generateThumbnails(
  inputPath: string,
  outputDir: string,
  duration: number,
): Promise<string[]> {
  const thumbnails: string[] = [];
  const positions = [0.25, 0.5, 0.75];

  for (let i = 0; i < positions.length; i++) {
    const timestamp = duration * positions[i];
    const outputPath = path.join(outputDir, `thumb_${i}.jpg`);

    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-i',
      inputPath,
      '-ss',
      String(timestamp),
      '-vframes',
      '1',
      '-vf',
      "scale='min(640,iw)':'min(360,ih)':force_original_aspect_ratio=decrease",
      '-q:v',
      '2',
      '-y',
      outputPath,
    ];

    const result = await runFFmpeg(args, 30_000);
    if (result.exitCode === 0 && fs.existsSync(outputPath)) {
      thumbnails.push(`thumb_${i}.jpg`);
    } else {
      console.warn(`⚠️ [Worker] Thumbnail ${i} failed:`, result.stderr.slice(0, 200));
    }
  }
  return thumbnails;
}

// ─── Upload folder to S3 (stream-based) ───
async function uploadFolderToS3(localDir: string, s3Prefix: string): Promise<void> {
  const files = fs.readdirSync(localDir, { recursive: true });
  for (const file of files) {
    const filePath = path.join(localDir, file as string);
    if (!fs.statSync(filePath).isFile()) continue;
    const contentType = getContentType(filePath);
    await uploadFileToS3(filePath, `${s3Prefix}/${file}`, contentType);
  }
}

/**
 * Worker اصلی پردازش ویدیو
 */
const videoProcessorWorker = new Worker(
  'video-processing',
  async (job: Job) => {
    const { lectureId, storageKey, contentItemId } = job.data;
    let tmpDir = '';

    console.log(
      `🎬 [Worker] شروع پردازش ویدیو - درس: ${lectureId}` +
        `${contentItemId ? ` contentItem: ${contentItemId}` : ' (legacy)'}`,
    );

    // ✅ به‌روزرسانی وضعیت هدف (ContentItem یا legacy) + آینه‌کردن روی lecture.processing
    const writeTargetStatus = async (
      status: string,
      progress: number,
      extra: Record<string, any> = {},
    ): Promise<void> => {
      const mirror: Record<string, any> = {
        'processing.status': status,
        'processing.progress': progress,
        ...extra,
      };
      if (contentItemId) {
        const ciUpdate: Record<string, any> = {};
        for (const [k, v] of Object.entries(mirror)) {
          // مثال: processing.status → contentItems.$.processing.status
          ciUpdate[`contentItems.$.${k}`] = v;
        }
        await Lecture.updateOne(
          { _id: lectureId, 'contentItems._id': contentItemId },
          { $set: ciUpdate },
        );
      }
      await Lecture.updateOne({ _id: lectureId }, { $set: mirror });
    };

    try {
      // ۰. بارگذاری درس و تعیین هدف job
      const lecture = await Lecture.findById(lectureId).lean();
      if (!lecture) throw new Error(`Lecture ${lectureId} not found`);

      let contentItem: any = null;
      if (contentItemId) {
        contentItem = (lecture.contentItems || []).find(
          (item: any) => item._id?.toString() === contentItemId,
        );
        if (!contentItem) {
          throw new Error(`ContentItem ${contentItemId} در درس ${lectureId} یافت نشد`);
        }
        if (contentItem.type !== 'video') {
          throw new Error(`ContentItem ${contentItemId} از نوع ${contentItem.type} است و قابل transcode نیست`);
        }
      }

      const targetKey = contentItem
        ? contentItem.storage?.key || ''
        : lecture.storage?.key || '';

      // job کهنه: هدف بعداً به فایل دیگری (آپلود مجدد) تغییر کرده → این job منسوخ است
      if (targetKey && storageKey && targetKey !== storageKey) {
        console.log(`⏭️ [Worker] job کهنه برای کلید قدیمی — رد شد (lecture ${lectureId})`);
        return { success: true, lectureId, contentItemId, skipped: 'stale-key' };
      }

      // idempotency واقعی: فقط اگر خروجی HLS واقعاً ساخته شده باشد رد می‌شود
      const proc = contentItem ? contentItem.processing : lecture.processing;
      const isTrulyReady =
        proc?.status === 'READY' &&
        Array.isArray(proc?.hls?.qualities) &&
        proc.hls.qualities.length > 0;
      if (isTrulyReady) {
        console.log(`⏭️ [Worker] هدف ${lectureId} قبلاً پردازش واقعی شده — رد شد`);
        return { success: true, lectureId, contentItemId, skipped: 'already-ready' };
      }

      // بررسی path traversal
      if (storageKey.includes('..') || storageKey.includes('//') || storageKey.startsWith('/')) {
        throw new Error(`Invalid storage key: ${storageKey}`);
      }

      // ۱. بررسی FFmpeg
      if (!checkFFmpegAvailable()) {
        throw new Error('FFmpeg روی سرور نصب نیست');
      }

      // ۲. ایجاد پوشه موقت
      tmpDir = createJobTempDir(job.id!);
      const inputPath = path.join(tmpDir, 'input.mp4');
      const hlsOutputDir = path.join(tmpDir, 'hls');
      const thumbOutputDir = path.join(tmpDir, 'thumbs');

      // ۳. به‌روزرسانی وضعیت
      await writeTargetStatus('PROCESSING', 5, {
        'processing.startedAt': new Date(),
        'processing.error': null,
      });
      await job.updateProgress(10);

      // ۴. دانلود از S3 (stream-based)
      console.log(`📥 [Worker] دانلود فایل از S3: ${storageKey}`);
      await downloadFromS3(storageKey, inputPath);
      await job.updateProgress(25);

      // ۵. استخراج مدت زمان
      const duration = extractDurationFromFile(inputPath);
      console.log(`⏱️ [Worker] مدت زمان ویدیو: ${duration} ثانیه`);
      if (duration <= 0) throw new Error('Could not extract video duration');
      await job.updateProgress(30);

      // ۶. تبدیل به HLS
      console.log(`🔄 [Worker] تبدیل به HLS...`);
      const hlsResult = await transcodeToHLS(inputPath, hlsOutputDir);
      await job.updateProgress(65);

      // ۷. آپلود HLS به S3 (stream-based)
      console.log(`📤 [Worker] آپلود فایل‌های HLS به S3...`);
      const hlsPrefix = storageKey.replace(/\.[^.]+$/, '') + '/hls';
      await uploadFolderToS3(hlsOutputDir, hlsPrefix);
      await job.updateProgress(80);

      // ۸. تولید Thumbnail
      console.log(`🖼️ [Worker] تولید thumbnail...`);
      const thumbnails = await generateThumbnails(inputPath, thumbOutputDir, duration);
      const thumbPrefix = storageKey.replace(/\.[^.]+$/, '') + '/thumbs';
      await uploadFolderToS3(thumbOutputDir, thumbPrefix);
      await job.updateProgress(90);

      // ۹. به‌روزرسانی MongoDB (هدف واقعی + آینه روی legacy + duration)
      const masterPlaylistUrl = `${hlsPrefix}/master.m3u8`;
      const thumbnailUrls = thumbnails.map((t) => `${thumbPrefix}/${t}`);

      await writeTargetStatus('READY', 100, {
        'processing.hls.masterPlaylist': masterPlaylistUrl,
        'processing.hls.qualities': hlsResult.qualities,
        'processing.thumbnails': thumbnailUrls,
        'processing.completedAt': new Date(),
      });
      // همگام‌سازی مدت زمان (legacy) + مدت ویدیوی ContentItem
      await Lecture.updateOne({ _id: lectureId }, { $set: { duration: Math.round(duration) } });
      if (contentItemId) {
        await Lecture.updateOne(
          { _id: lectureId, 'contentItems._id': contentItemId },
          { $set: { 'contentItems.$.videoDuration': Math.round(duration) } },
        );
      }

      await job.updateProgress(100);
      console.log(`✅ [Worker] پردازش ویدیو تکمیل شد - درس: ${lectureId}`);

      return {
        success: true,
        lectureId,
        contentItemId,
        qualities: hlsResult.qualities,
        thumbnails: thumbnailUrls,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'خطای ناشناخته';
      console.error(`❌ [Worker] خطا در پردازش ویدیو ${lectureId}:`, errorMessage);

      try {
        await writeTargetStatus('FAILED', 0, {
          'processing.error': errorMessage.slice(0, 1000),
          'processing.completedAt': new Date(),
        });
      } catch (writeErr) {
        console.error('❌ [Worker] ثبت وضعیت FAILED ممکن نشد:', writeErr);
      }

      throw error;
    } finally {
      cleanupTempDir(tmpDir);
    }
  },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.MULTIPART_CONCURRENT || '2', 10),
    limiter: { max: 3, duration: 60_000 },
    removeOnFail: { age: 604800 },
    removeOnComplete: { age: 86400, count: 50 },
  },
);

// ─── رویدادهای Worker ───
videoProcessorWorker.on('completed', (job) => {
  console.log(`✅ [Worker] Job ${job.id} تکمیل شد`);
});

videoProcessorWorker.on('failed', (job, err) => {
  console.error(`❌ [Worker] Job ${job?.id} شکست خورد:`, err.message);
});

videoProcessorWorker.on('error', (err) => {
  console.error('❌ [Worker] خطای کلی:', err);
});

export default videoProcessorWorker;
