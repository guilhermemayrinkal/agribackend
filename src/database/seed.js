const { testConnection } = require('../config/database');
const { seedChartTemplates } = require('./seeds/001_chart_templates');
const { seedUsers } = require('./seeds/002_users');
const { seedCompanies } = require('./seeds/003_companies');

const runSeeds = async () => {
  console.log('🌱 Starting database seeding...');
  
  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Cannot connect to database. Aborting seeding.');
    process.exit(1);
  }

  try {
    // Run seeds in order
    await seedChartTemplates();
    await seedUsers();
    await seedCompanies();
    
    console.log('🎉 All seeds completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeds if called directly
if (require.main === module) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Seeding process failed:', error);
      process.exit(1);
    });
}

module.exports = { runSeeds };