const fs = require('fs');
const path = require('path');
const { executeQuery, testConnection } = require('../config/database');

const runMigrations = async () => {
  console.log('🚀 Starting database migrations...');
  
  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Cannot connect to database. Aborting migrations.');
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  console.log(`📁 Found ${migrationFiles.length} migration files`);

  for (const file of migrationFiles) {
    try {
      console.log(`⏳ Running migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      // Split by semicolon and execute each statement
      const statements = sql.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await executeQuery(statement);
        }
      }
      
      console.log(`✅ Migration completed: ${file}`);
    } catch (error) {
      console.error(`❌ Migration failed: ${file}`, error.message);
      process.exit(1);
    }
  }

  console.log('🎉 All migrations completed successfully!');
};

// Run migrations if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };