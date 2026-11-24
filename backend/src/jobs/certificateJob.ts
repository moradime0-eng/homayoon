import Bull from 'bull';
import Certificate from '../models/Certificate';
import Enrollment from '../models/Enrollment';
import { generateCertificateNumber, generateCertificateHash } from '../utils/certificateGenerator';
import { runWithTenantContext } from '../utils/tenantContext';

let certificateQueue: Bull.Queue | null = null;
let queueInitialized = false;

const initializeCertificateQueue = (): Bull.Queue | null => {
  if (queueInitialized) {
    return certificateQueue;
  }

  queueInitialized = true;

  try {
    certificateQueue = new Bull('certificate-queue', {
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: () => null,
        lazyConnect: true,
      },
    });

    certificateQueue.on('error', (err: any) => {
      if (err.code === 'ECONNREFUSED') {
        console.warn('⚠️ [CertificateQueue] Redis در دسترس نیست. صدور مدرک به صورت مستقیم انجام خواهد شد.');
      }
    });

    certificateQueue.on('ready', () => {
      console.log('✅ [CertificateQueue] Redis Connected');
    });

    const generateCertDirectly = async (enrollmentId: string, tenantId?: string) => {
      // Run with tenant context if provided
      if (tenantId) {
        return runWithTenantContext({ tenantId }, async () => {
          return generateCertDirectlyInternal(enrollmentId);
        });
      }
      return generateCertDirectlyInternal(enrollmentId);
    };

    const generateCertDirectlyInternal = async (enrollmentId: string) => {
      const enrollment = await Enrollment.findById(enrollmentId).populate('course').populate('student');

      if (!enrollment || !enrollment.isCompleted || enrollment.certificateIssued) return;

      const course = enrollment.course as any;
      const student = enrollment.student as any;

      const certificateNumber = generateCertificateNumber();
      const verificationHash = generateCertificateHash(
        student._id.toString(),
        course._id.toString(),
        new Date(),
      );

      const certificate = await Certificate.create({
        user: student._id,
        course: course._id,
        enrollment: enrollment._id,
        certificateNumber,
        verificationHash,
        studentName: student.fullName,
        courseName: course.title,
        instructorName: 'Instructor',
        completedAt: enrollment.completedAt || new Date(),
        totalHours: Math.round(course.totalDuration / 3600) || 1,
      });

      enrollment.certificateIssued = true;
      enrollment.certificate = certificate._id;
      await enrollment.save();
    };

    certificateQueue.process(async (job) => {
      const { enrollmentId, tenantId } = job.data;
      await generateCertDirectly(enrollmentId, tenantId);
      return { success: true };
    });

    console.log('✅ [CertificateQueue] Queue initialized');
  } catch (error) {
    console.error('❌ [CertificateQueue] Failed to initialize queue:', error);
    certificateQueue = null;
  }

  return certificateQueue;
};

export const queueCertificateGeneration = async (enrollmentId: string, tenantId?: string) => {
  const queue = initializeCertificateQueue();
  
  if (!queue) {
    // Fallback: generate certificate directly without queue
    console.log('📜 [CertificateQueue] Generating certificate directly (queue unavailable)');
    
    const generateCertDirectly = async (enrollmentId: string, tenantId?: string) => {
      if (tenantId) {
        return runWithTenantContext({ tenantId }, async () => {
          return generateCertDirectlyInternal(enrollmentId);
        });
      }
      return generateCertDirectlyInternal(enrollmentId);
    };

    const generateCertDirectlyInternal = async (enrollmentId: string) => {
      const enrollment = await Enrollment.findById(enrollmentId).populate('course').populate('student');

      if (!enrollment || !enrollment.isCompleted || enrollment.certificateIssued) return;

      const course = enrollment.course as any;
      const student = enrollment.student as any;

      const certificateNumber = generateCertificateNumber();
      const verificationHash = generateCertificateHash(
        student._id.toString(),
        course._id.toString(),
        new Date(),
      );

      const certificate = await Certificate.create({
        user: student._id,
        course: course._id,
        enrollment: enrollment._id,
        certificateNumber,
        verificationHash,
        studentName: student.fullName,
        courseName: course.title,
        instructorName: 'Instructor',
        completedAt: enrollment.completedAt || new Date(),
        totalHours: Math.round(course.totalDuration / 3600) || 1,
      });

      enrollment.certificateIssued = true;
      enrollment.certificate = certificate._id;
      await enrollment.save();
    };

    await generateCertDirectly(enrollmentId, tenantId);
    return;
  }

  try {
    await queue.add({ enrollmentId, tenantId });
  } catch {
    // در صورت در دسترس نبودن ریدیس، صدور مدرک به صورت مستقیم انجام می‌شود
    console.log('📜 [CertificateQueue] Fallback to direct generation');
    
    const generateCertDirectly = async (enrollmentId: string, tenantId?: string) => {
      if (tenantId) {
        return runWithTenantContext({ tenantId }, async () => {
          return generateCertDirectlyInternal(enrollmentId);
        });
      }
      return generateCertDirectlyInternal(enrollmentId);
    };

    const generateCertDirectlyInternal = async (enrollmentId: string) => {
      const enrollment = await Enrollment.findById(enrollmentId).populate('course').populate('student');

      if (!enrollment || !enrollment.isCompleted || enrollment.certificateIssued) return;

      const course = enrollment.course as any;
      const student = enrollment.student as any;

      const certificateNumber = generateCertificateNumber();
      const verificationHash = generateCertificateHash(
        student._id.toString(),
        course._id.toString(),
        new Date(),
      );

      const certificate = await Certificate.create({
        user: student._id,
        course: course._id,
        enrollment: enrollment._id,
        certificateNumber,
        verificationHash,
        studentName: student.fullName,
        courseName: course.title,
        instructorName: 'Instructor',
        completedAt: enrollment.completedAt || new Date(),
        totalHours: Math.round(course.totalDuration / 3600) || 1,
      });

      enrollment.certificateIssued = true;
      enrollment.certificate = certificate._id;
      await enrollment.save();
    };

    await generateCertDirectly(enrollmentId, tenantId);
  }
};

export default certificateQueue;
