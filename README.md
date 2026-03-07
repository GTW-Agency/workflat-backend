# Workflat Backend API

A complete Node.js + TypeScript backend for the Workflat job board platform.

## Tech Stack
- **Runtime**: Node.js 18
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: JWT (access + refresh tokens)
- **Payments**: Stripe
- **File Storage**: Cloudinary
- **Real-time**: Socket.IO
- **Email**: Nodemailer

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Setup database
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run in development
```bash
npm run dev
```

## API Base URL
```
http://localhost:5000/api/v1
```

## Authentication
All protected routes require:
```
Authorization: Bearer <token>
```

## User Roles
| Role | Description |
|------|-------------|
| ADMIN | Full platform control |
| EMPLOYER | Post jobs, manage applications |
| APPLICANT | Apply to jobs, manage profile |

## Key Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Register new user |
| POST | /auth/login | Login |
| POST | /auth/logout | Logout |
| POST | /auth/refresh-token | Refresh access token |
| POST | /auth/forgot-password | Request password reset |
| GET  | /auth/me | Get current user |
| PUT  | /auth/change-password | Change password |

### Jobs (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /jobs | Search & filter jobs |
| GET | /jobs/featured | Get featured jobs |
| GET | /jobs/:id | Get single job |
| POST | /jobs/:id/apply | Apply to job (APPLICANT) |

### Employers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /employers/dashboard | Dashboard stats |
| GET/PUT | /employers/profile | Manage profile |
| GET/POST | /employers/jobs | List/create jobs |
| PUT/DELETE | /employers/jobs/:id | Update/delete job |
| GET | /employers/jobs/:id/applications | View applicants |
| PUT | /employers/applications/:id/status | Update status |
| POST | /employers/applications/:id/interview | Schedule interview |
| GET | /employers/subscription | Get subscription |
| POST | /employers/subscription/upgrade | Upgrade plan |

### Applicants
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /applicants/dashboard | Dashboard stats |
| GET/PUT | /applicants/profile | Manage profile |
| POST | /applicants/profile/resume | Upload resume |
| GET | /applicants/applications | My applications |
| PUT | /applicants/applications/:id/withdraw | Withdraw |
| GET/POST/DELETE | /applicants/saved-jobs | Saved jobs |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /admin/dashboard | Full analytics |
| GET | /admin/users | All users |
| PUT | /admin/users/:id/status | Ban/activate user |
| GET | /admin/jobs | All jobs |
| POST | /admin/jobs | Post job (auto-approved) |
| PUT | /admin/jobs/:id/approve | Approve job |
| PUT | /admin/jobs/:id/reject | Reject job |
| GET/POST/PUT/DELETE | /admin/content | CMS content |
| GET | /admin/employers | All employers |
| PUT | /admin/employers/:id/verify | Verify employer |

## Socket.IO Events
Connect and authenticate:
```javascript
const socket = io('http://localhost:5000');
socket.emit('authenticate', jwtToken);
socket.on('notification', (data) => console.log(data));
```

## Docker
```bash
docker-compose up -d
```

## Environment Variables
See `.env.example` for all required variables.

## Subscription Plans
| Plan | Jobs/Month | Featured | Duration |
|------|-----------|----------|----------|
| FREE | 1 | 0 | 30 days |
| STANDARD | 5 | 1 | 60 days |
| PREMIUM | Unlimited | 3 | 90 days |
# workflat-backend
