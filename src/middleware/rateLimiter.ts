import rateLimit from 'express-rate-limit';

// General API limit: 100 req / 15 min per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Please try again later.' },
});

// Auth routes: 5 failed attempts / hour per IP
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed attempts', message: 'Account temporarily locked. Try again in 1 hour.' },
});

// Job posting: prevent spam
export const jobPostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many job posts', message: 'Please wait before posting more jobs.' },
});
