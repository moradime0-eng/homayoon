import express from 'express';
import { Readable } from 'stream';
import request from 'supertest';
import Course from '../models/Course';
import Lecture from '../models/Lecture';
import Enrollment from '../models/Enrollment';
import storage from '../services/storageService';
import CourseAccessService from '../services/courseAccess.service';
import { streamLectureVideo, serveFile } from '../controllers/uploadController';
import { errorHandler } from '../middlewares/errorHandler';

jest.mock('../models/Course', () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock('../models/Lecture', () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock('../models/Enrollment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../services/storageService', () => ({
  __esModule: true,
  default: { getFileInfo: jest.fn(), getVideoStream: jest.fn() },
}));
jest.mock('../services/courseAccess.service', () => ({
  __esModule: true,
  default: { getLectureAccess: jest.fn() },
}));
const app = express();
app.use((req: any, _res, next) => {
  if (req.headers['x-user'])
    req.user = { _id: req.headers['x-user'], role: req.headers['x-role'] || 'student' };
  next();
});
app.all('/video/:lectureId', streamLectureVideo);
app.get('/file/:lectureId', serveFile);
app.use(errorHandler);

// Use a valid ObjectId for lectureId in tests
const VALID_LECTURE_ID = '507f1f77bcf86cd799439011';
const VALID_COURSE_ID = '507f1f77bcf86cd799439012';

// Module-level state variables
let status = 'published';
let isPublished = true;
let isFreePreview = false;
let enrolled = false;

function setupDefaultMocks() {
  (Course.findById as jest.Mock).mockImplementation(() => ({
    select: () => ({
      lean: async () => ({ status, isFree: false, instructor: 'owner', coInstructors: [] }),
    }),
  }));
  (Lecture.findById as jest.Mock).mockImplementation(async () => ({
    course: VALID_COURSE_ID,
    isPublished,
    isFreePreview,
    storage: { key: 'private/video.mp4' },
    fileUrl: 'private/file.pdf',
    contentItems: [],
  }));
  (Enrollment.findOne as jest.Mock).mockImplementation(() => ({
    select: async () => (enrolled ? { _id: 'enrollment' } : null),
  }));
  (storage.getFileInfo as jest.Mock).mockResolvedValue({ size: 4, contentType: 'application/pdf' });
  (storage.getVideoStream as jest.Mock).mockImplementation(async () => ({
    stream: Readable.from(Buffer.from('data')),
    contentLength: 4,
    totalSize: 4,
  }));
  (CourseAccessService.getLectureAccess as jest.Mock).mockResolvedValue({
    isAccessible: true,
    isCompleted: false,
    lockReason: 'none',
    contentItems: [],
    previousLectureCompleted: true,
    dripPolicy: {
      enabled: false,
      lessonsPerInterval: 1,
      intervalHours: 24,
      requirePreviousCompletion: true,
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  status = 'published';
  isPublished = true;
  isFreePreview = false;
  enrolled = false;
  setupDefaultMocks();
});
test('anonymous and unregistered students cannot stream private video or download file', async () => {
  expect((await request(app).head(`/video/${VALID_LECTURE_ID}`)).status).toBe(401);
  expect((await request(app).get(`/file/${VALID_LECTURE_ID}`)).status).toBe(401);
  expect(
    (await request(app).head(`/video/${VALID_LECTURE_ID}`).set('x-user', 'student')).status,
  ).toBe(403);
  expect(
    (await request(app).get(`/file/${VALID_LECTURE_ID}`).set('x-user', 'student')).status,
  ).toBe(403);
  expect(storage.getFileInfo).not.toHaveBeenCalled();
});
test('enrolled student can stream while responses cannot be cached publicly', async () => {
  enrolled = true;
  const result = await request(app).head(`/video/${VALID_LECTURE_ID}`).set('x-user', 'student');
  expect(result.status).toBe(200);
  expect(result.headers['cache-control']).toBe('private, no-store');
});
test('preview is inaccessible for unpublished course or unpublished lecture', async () => {
  isFreePreview = true;
  status = 'draft';
  // Mock Course.findById to return draft course for free preview check
  (Course.findById as jest.Mock).mockImplementationOnce(() => ({
    select: () => ({
      lean: async () => ({
        status: 'draft',
        isFree: false,
        instructor: 'owner',
        coInstructors: [],
      }),
    }),
  }));
  expect((await request(app).head(`/video/${VALID_LECTURE_ID}`)).status).toBe(404);

  status = 'published';
  isPublished = false;
  // Mock Course.findById to return published course but lecture is unpublished
  (Course.findById as jest.Mock).mockImplementationOnce(() => ({
    select: () => ({
      lean: async () => ({
        status: 'published',
        isFree: false,
        instructor: 'owner',
        coInstructors: [],
      }),
    }),
  }));
  // Mock Lecture.findById to return unpublished lecture
  (Lecture.findById as jest.Mock).mockImplementationOnce(async () => ({
    course: 'course',
    isPublished: false,
    isFreePreview: true,
    storage: { key: 'private/video.mp4' },
    fileUrl: 'private/file.pdf',
    contentItems: [],
  }));
  expect((await request(app).head(`/video/${VALID_LECTURE_ID}`)).status).toBe(404);
  expect((await request(app).get(`/file/${VALID_LECTURE_ID}`)).status).toBe(404);

  // Reset mocks for subsequent tests
  (Course.findById as jest.Mock).mockImplementation(() => ({
    select: () => ({
      lean: async () => ({
        status: 'published',
        isFree: false,
        instructor: 'owner',
        coInstructors: [],
      }),
    }),
  }));
  (Lecture.findById as jest.Mock).mockImplementation(async () => ({
    course: 'course',
    isPublished: true,
    isFreePreview: false,
    storage: { key: 'private/video.mp4' },
    fileUrl: 'private/file.pdf',
    contentItems: [],
  }));
});
test('owner and admin can access draft, another instructor cannot', async () => {
  status = 'draft';
  expect(
    (
      await request(app)
        .head(`/video/${VALID_LECTURE_ID}`)
        .set('x-user', 'owner')
        .set('x-role', 'instructor')
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .head(`/video/${VALID_LECTURE_ID}`)
        .set('x-user', 'admin')
        .set('x-role', 'admin')
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .head(`/video/${VALID_LECTURE_ID}`)
        .set('x-user', 'other')
        .set('x-role', 'instructor')
    ).status,
  ).toBe(404);
});

test('enrolled student receives mocked private video and attachment bytes without shared caching', async () => {
  enrolled = true;
  const video = await request(app).get(`/video/${VALID_LECTURE_ID}`).set('x-user', 'student');
  expect(video.status).toBe(200);
  expect(video.body.toString()).toBe('data');
  expect(video.headers['cache-control']).toBe('private, no-store');
  const file = await request(app).get(`/file/${VALID_LECTURE_ID}`).set('x-user', 'student');
  expect(file.status).toBe(200);
  expect(file.body.toString()).toBe('data');
  expect(file.headers['cache-control']).toBe('private, no-store');
});

test('unknown content item never falls back to another video or file', async () => {
  enrolled = true;
  expect(
    (
      await request(app)
        .get(`/video/${VALID_LECTURE_ID}?resourceId=unknown`)
        .set('x-user', 'student')
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .get(`/file/${VALID_LECTURE_ID}?resourceId=unknown`)
        .set('x-user', 'student')
    ).status,
  ).toBe(404);
  expect(storage.getVideoStream).not.toHaveBeenCalled();
});
