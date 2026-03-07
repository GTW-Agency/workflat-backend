import { Request } from 'express';
import { Role, UserStatus } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

// Fixed: Made all user properties optional with ? to match auth middleware
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
    status: UserStatus;
    applicantProfile?: any;
    employerProfile?: any;
    subscription?: any[];
  };
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export interface JobFilters {
  query?: string;
  location?: string;
  category?: string;
  employment_type?: string;
  salary_min?: string;
  salary_max?: string;
  remote_only?: string;
  page?: string;
  limit?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}