const bcrypt = require('bcryptjs');
const { executeQuery } = require('../../config/database');

const users = [
  {
    name: 'Admin System',
    email: 'admin@businessanalytics.com',
    password: '123456',
    role: 'admin'
  },
  {
    name: 'Carlos Analista',
    email: 'carlos@businessanalytics.com',
    password: '123456',
    role: 'analyst'
  },
  {
    name: 'Ana Consultora',
    email: 'ana@businessanalytics.com',
    password: '123456',
    role: 'analyst'
  }
];

const seedUsers = async () => {
  console.log('🌱 Seeding users...');
  
  for (const user of users) {
    try {
      const hashedPassword = await bcrypt.hash(user.password, 12);
      await executeQuery(
        `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
        [user.name, user.email, hashedPassword, user.role]
      );
      console.log(`✅ User created: ${user.email}`);
    } catch (error) {
      console.log(`⚠️  User already exists: ${user.email}`);
    }
  }
};

module.exports = { seedUsers };