import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@workflat.com';
  const password = process.env.ADMIN_PASSWORD || 'change-me-immediately';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      email,
      password_hash,
      role:           'ADMIN',
      status:         'ACTIVE',
      email_verified: true,
    },
    select: { id: true, email: true, role: true },
  });

  console.log('Admin created:', admin);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());