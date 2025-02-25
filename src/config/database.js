require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Sequelize } = require('sequelize');
const path = require('path');

// Define the path for the SQLite database file
const dbPath = path.join(__dirname, '../../data/vscode_extensions.sqlite');

// Create Sequelize instance with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false
});

// Test the connection
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('SQLite bazasiga muvaffaqiyatli ulandi');
    
    // Sync the models with the database
    await sequelize.sync();
    console.log('Database jadvallar sinxronlashtirildi');
  } catch (error) {
    console.error('SQLite bazasiga ulanishda xatolik:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB }; 