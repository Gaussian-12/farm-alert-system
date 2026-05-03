require('dotenv').config();
const { promisePool } = require('./db');

async function sendWeatherAlert() {
    try {
        const [farmers] = await promisePool.query('SELECT phone_number, name FROM farmer_registrations');
        
        if (farmers.length === 0) {
            console.log('❌ No farmers registered yet.');
            return;
        }
        
        console.log(`📡 Would send weather alert to ${farmers.length} farmers:`);
        
        const weatherMessage = `🌧️ WEATHER ALERT: Heavy rains expected in Central and Southern regions tomorrow. Farmers are advised to secure their harvest. - Farm Alert Malawi`;
        
        for (const farmer of farmers) {
            console.log(`📤 [TEST MODE] Would send to: ${farmer.phone_number} (${farmer.name || 'No name'})`);
            console.log(`📤 Message: ${weatherMessage}`);
            
            // Just log to database as if sent
            await promisePool.query(
                'INSERT INTO messages (phone_number, direction, message) VALUES (?, ?, ?)',
                [farmer.phone_number, 'outgoing', `[TEST MODE] ${weatherMessage}`]
            );
        }
        
        console.log(`\n✅ Logged alerts for ${farmers.length} farmers to database`);
        console.log(`💡 To send real SMS, switch to Live mode in Africa's Talking dashboard`);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

sendWeatherAlert();