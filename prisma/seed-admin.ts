import { PrismaClient } from '../generated/prisma/client.js';
import { AdminRole } from '../generated/prisma/enums.js';
import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';

config();

const prisma = new PrismaClient();

async function seedAdmin() {
  console.log('Seeding admin user...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const adminRole = (process.env.ADMIN_ROLE as AdminRole) || AdminRole.SUPER_ADMIN;

  // Check if admin already exists
  const existingAdmin = await prisma.admin.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`○ Admin already exists: ${adminEmail}`);
    console.log(`  Role: ${existingAdmin.role}`);
    console.log(`  Active: ${existingAdmin.isActive}`);
    return;
  }

  // Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

  // Create admin
  const admin = await prisma.admin.create({
    data: {
      email: adminEmail,
      password: hashedPassword,
      role: adminRole,
      isActive: true,
    },
  });

  console.log(`✓ Admin created successfully!`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Role: ${admin.role}`);
  console.log(`  ID: ${admin.id}`);
  console.log(`\n⚠️  IMPORTANT: Change the default password after first login!`);
}

seedAdmin()
  .catch((error) => {
    console.error('Error seeding admin:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

