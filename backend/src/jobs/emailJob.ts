import Bull from 'bull';
import EmailService from '../config/email';

let emailQueue: Bull.Queue | null = null;
let queueInitialized = false;

const initializeEmailQueue = (): Bull.Queue | null => {
  if (queueInitialized) {
    return emailQueue;
  }

  queueInitialized = true;

  try {
    emailQueue = new Bull('email-queue', {
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: () => null,
        lazyConnect: true,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    });

    emailQueue.on('error', (err: any) => {
      if (err.code === 'ECONNREFUSED') {
        console.warn('⚠️ [EmailQueue] Redis در دسترس نیست. ایمیل‌ها به صورت مستقیم ارسال خواهند شد.');
      }
    });

    emailQueue.on('ready', () => {
      console.log('✅ [EmailQueue] Redis Connected');
    });

    emailQueue.process(async (job) => {
      const { to, subject, html, text, tenantId } = job.data;
      // Set tenant context for the job
      if (tenantId) {
        process.env.CURRENT_TENANT_ID = tenantId;
      }
      await EmailService.sendEmail({ to, subject, html, text });
      return { success: true };
    });

    console.log('✅ [EmailQueue] Queue initialized');
  } catch (error) {
    console.error('❌ [EmailQueue] Failed to initialize queue:', error);
    emailQueue = null;
  }

  return emailQueue;
};

export const queueEmail = async (data: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tenantId?: string; // Add tenantId for multi-tenancy
}) => {
  const queue = initializeEmailQueue();
  
  if (!queue) {
    // Fallback: send email directly without queue
    console.log('📧 [EmailQueue] Sending email directly (queue unavailable)');
    await EmailService.sendEmail(data);
    return;
  }

  try {
    await queue.add(data);
  } catch {
    await EmailService.sendEmail(data);
  }
};

export const queueBulkEmail = async (
  recipients: string[],
  subject: string,
  html: string,
  tenantId?: string,
) => {
  for (const to of recipients) {
    await queueEmail({ to, subject, html, tenantId });
  }
};

export default emailQueue;
