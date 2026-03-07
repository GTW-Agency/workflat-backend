import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
};

export const validateRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  body('role').isIn(['EMPLOYER', 'APPLICANT']).withMessage('Role must be EMPLOYER or APPLICANT'),
  handleValidationErrors,
];

export const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

export const validateJobPost = [
  body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be 5-100 characters'),
  body('description').trim().isLength({ min: 50 }).withMessage('Description must be at least 50 characters'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('employment_type').isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP']).withMessage('Invalid employment type'),
  body('location_type').isIn(['ONSITE', 'REMOTE', 'HYBRID']).withMessage('Invalid location type'),
  body('salary_min').optional().isInt({ min: 0 }).withMessage('Salary min must be a positive number'),
  body('salary_max').optional().isInt({ min: 0 }).withMessage('Salary max must be a positive number'),
  handleValidationErrors,
];

export const validateApplication = [
  body('cover_letter').optional().trim().isLength({ max: 5000 }),
  handleValidationErrors,
];

export const validateUpdateApplicationStatus = [
  body('status').isIn(['REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'])
    .withMessage('Invalid application status'),
  handleValidationErrors,
];

export const validateInterviewSchedule = [
  body('interview_date').isISO8601().withMessage('Valid date required'),
  body('interview_type').isIn(['PHONE', 'VIDEO', 'ONSITE']).withMessage('Invalid interview type'),
  body('interview_link').optional().isURL().withMessage('Invalid URL'),
  handleValidationErrors,
];

export const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
];

export const validateUUID = (field: string) => [
  param(field).isUUID().withMessage(`Invalid ${field}`),
  handleValidationErrors,
];

export const validatePasswordChange = [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must be at least 8 chars with uppercase, lowercase, and number'),
  handleValidationErrors,
];

export const validateContent = [
  body('type').isIn(['BLOG', 'FAQ', 'PAGE']).withMessage('Invalid content type'),
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('slug').trim().isSlug().withMessage('Slug must be URL-friendly'),
  handleValidationErrors,
];
