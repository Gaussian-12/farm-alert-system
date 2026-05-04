require('dotenv').config();
const mysql = require('mysql2');

// Create connection pool for Aiven cloud database
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'farm_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Add SSL for Aiven cloud (ignore for localhost)
    ...(process.env.DB_HOST && { ssl: { rejectUnauthorized: false } })
});

const promisePool = pool.promise();

async function testConnection() {
    try {
        const [result] = await promisePool.query('SELECT 1 as connected');
        console.log('✅ MySQL connected successfully!');
        if (process.env.DB_HOST) {
            console.log(`📡 Connected to cloud database: ${process.env.DB_HOST}`);
        }
        return true;
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        console.error('   Check your environment variables:');
        console.error(`   DB_HOST: ${process.env.DB_HOST || 'not set'}`);
        console.error(`   DB_PORT: ${process.env.DB_PORT || 'not set'}`);
        console.error(`   DB_USER: ${process.env.DB_USER || 'not set'}`);
        console.error(`   DB_NAME: ${process.env.DB_NAME || 'not set'}`);
        return false;
    }
}

module.exports = { promisePool, testConnection };