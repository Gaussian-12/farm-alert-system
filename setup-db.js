require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupDatabase() {
    console.log('🚀 Setting up farm_system database...\n');

    // Connect without a database first to create it
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
        });
        console.log('✅ Connected to MySQL server');
    } catch (error) {
        console.error('❌ Cannot connect to MySQL:', error.message);
        console.error('   Make sure MySQL is running and your .env credentials are correct');
        process.exit(1);
    }

    try {
        // Create database
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'farm_system'}\``);
        await connection.query(`USE \`${process.env.DB_NAME || 'farm_system'}\``);
        console.log(`✅ Database '${process.env.DB_NAME || 'farm_system'}' ready`);

        // Create farmer_registrations table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS farmer_registrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone_number VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100),
                registered_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                total_queries INT DEFAULT 0
            )
        `);
        console.log('✅ Table: farmer_registrations');

        // Create messages table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone_number VARCHAR(20) NOT NULL,
                direction ENUM('incoming', 'outgoing') NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table: messages');

        // Create prices table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS prices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                crop_name VARCHAR(100) NOT NULL,
                price_per_kg DECIMAL(10,2) NOT NULL,
                market_location VARCHAR(200) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table: prices');

        // Seed initial price data
        const [existing] = await connection.query('SELECT COUNT(*) as count FROM prices');
        if (existing[0].count === 0) {
            await connection.query(`
                INSERT INTO prices (crop_name, price_per_kg, market_location) VALUES
                ('maize', 350.00, 'Lilongwe Central Market'),
                ('maize', 340.00, 'Blantyre Limbe Market'),
                ('tomatoes', 500.00, 'Lilongwe Central Market'),
                ('tomatoes', 480.00, 'Mzuzu City Market'),
                ('beans', 800.00, 'Lilongwe Central Market'),
                ('beans', 820.00, 'Blantyre Limbe Market'),
                ('groundnuts', 1200.00, 'Lilongwe Central Market'),
                ('rice', 750.00, 'Lilongwe Central Market')
            `);
            console.log('✅ Seeded initial crop prices');
        } else {
            console.log('ℹ️  Prices table already has data, skipping seed');
        }

        console.log('\n🎉 Database setup complete!');
        console.log('   Run: npm start          → Start SMS server (port 3000)');
        console.log('   Run: npm run dashboard  → Start web dashboard (port 3001)');

    } catch (error) {
        console.error('❌ Setup error:', error.message);
    } finally {
        await connection.end();
    }
}

setupDatabase();
