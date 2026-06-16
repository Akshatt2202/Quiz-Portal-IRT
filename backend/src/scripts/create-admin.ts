import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: npx ts-node src/scripts/create-admin.ts <email> <password> <name>');
    process.exit(1);
  }

  const [email, password, name] = args;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.error('Error: User with this email already exists.');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password_hash: passwordHash,
        role: 'admin',
      },
    });

    console.log(`Successfully created Admin: ${user.name} (${user.email})`);
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
