const bcrypt = require('bcryptjs');
const { PrismaClient } = require('./generated/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function fix() {
  const plainPassword = 'Admin@123'; // ye tera naya password hoga
  const hashed = await bcrypt.hash(plainPassword, 10);
  
  console.log('Generated Hash:', hashed);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@syvora.in' },
    update: {
      password: hashed,
      role: 'ADMIN'
    },
    create: {
      email: 'admin@syvora.in',
      password: hashed,
      role: 'ADMIN',
      profile: { create: { name: 'Syvora Admin' } },
      cart: { create: {} },
      wishlist: { create: {} }
    }
  });

  console.log('DONE! Admin fixed:', admin.email);
  console.log('Login with -> Email: admin@syvora.in Password:', plainPassword);
  
  await prisma.$disconnect();
  process.exit(0);
}

fix();