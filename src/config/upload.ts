import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Resume Upload ─────────────────────────────────────────
const resumeStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'workflat/resumes',
    allowed_formats: ['pdf', 'doc', 'docx'],
    resource_type: 'raw',
  } as any,
});

export const uploadResume = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed'));
    }
  },
});

// ─── Image Upload ──────────────────────────────────────────
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'workflat/images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
  } as any,
});

export const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export { cloudinary };
