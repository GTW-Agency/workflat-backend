import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/authenticate';
import { uploadImage } from '../config/cloudinary';
import { Role, UserStatus } from '@prisma/client';

// Define the AuthenticatedRequest interface matching the actual user object structure
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;  // Use the enum type
    status: UserStatus;  // Use the enum type
    applicantProfile?: any;
    employerProfile?: any;
    subscription?: any[];
  };
}

const router = Router();

router.use(authenticate);

// GET /api/v1/users/me
router.get('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, 
        email: true, 
        role: true, 
        status: true,
        email_verified: true, 
        created_at: true, 
        last_login: true,
        applicantProfile: true,
        employerProfile: true,
        subscription: { 
          where: { status: 'ACTIVE' }, 
          take: 1 
        },
      },
    });
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/users/me
router.put('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Only allow email update here; profile updates go to /applicants or /employers
    const { email } = req.body;
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== req.user!.id) {
        res.status(409).json({ success: false, error: 'Email already in use' });
        return;
      }
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { email, email_verified: false },
      });
    }
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/users/me/avatar
router.post('/me/avatar', uploadImage.single('avatar'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { 
      res.status(400).json({ success: false, error: 'No file uploaded' }); 
      return; 
    }
    
    const url = (req.file as any).secure_url || (req.file as any).path;

    if (req.user!.role === 'APPLICANT') {
      // Use upsert to handle case where profile doesn't exist yet
      await prisma.applicantProfile.upsert({
        where: { user_id: req.user!.id },
        update: { avatar_url: url },
        create: { 
          user_id: req.user!.id, 
          first_name: '', 
          last_name: '', 
          avatar_url: url 
        },
      });
    } else if (req.user!.role === 'EMPLOYER') {
      await prisma.employerProfile.upsert({
        where: { user_id: req.user!.id },
        update: { logo_url: url },
        create: { 
          user_id: req.user!.id, 
          company_name: '', 
          logo_url: url 
        },
      });
    }

    res.json({ success: true, data: { url } });
  } catch (error: any) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/users/me/password
router.put('/me/password', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { current_password, new_password } = req.body;
    
    // Validate input
    if (!current_password || !new_password) {
      res.status(400).json({ 
        success: false, 
        error: 'Current password and new password are required' 
      });
      return;
    }

    if (new_password.length < 8) {
      res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters' 
      });
      return;
    }

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { password_hash: true }
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Verify current password
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(new_password, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password_hash: newPasswordHash }
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/users/me
router.delete('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      res.status(400).json({ success: false, error: 'Password is required' });
      return;
    }
    
    const user = await prisma.user.findUnique({ 
      where: { id: req.user!.id } 
    });
    
    if (!user) { 
      res.status(404).json({ success: false, error: 'User not found' }); 
      return; 
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { 
      res.status(401).json({ success: false, error: 'Incorrect password' }); 
      return; 
    }

    // Delete user (cascading deletes will handle profiles, applications, etc.)
    await prisma.user.delete({ where: { id: req.user!.id } });
    
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error: any) {
    console.error('Account deletion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;