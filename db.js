require('dotenv').config();
const mysql = require('mysql2');

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'farm_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Promisify for async/await
const promisePool = pool.promise();

// Test connection
async function testConnection() {
    try {
        await promisePool.query('SELECT 1');
        console.log('✅ MySQL connected successfully!');
        return true;
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        console.error('   Check your .env file: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
        return false;
    }
}

module.exports = { promisePool, testConnection };
