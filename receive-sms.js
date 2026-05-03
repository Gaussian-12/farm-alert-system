require('dotenv').config();
const express = require('express');
const { promisePool } = require('./db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Africa's Talking configuration
const API_KEY = process.env.API_KEY;
const USERNAME = process.env.USERNAME;
const africastalking = require('africastalking');
const atm = africastalking({ apiKey: API_KEY, username: USERNAME });
const sms = atm.SMS;

// Detect language from message
function detectLanguage(message) {
    const chichewaWords = ['chimanga', 'mphonda', 'nyemba', 'mtengo', 'thandizo', 'malo', 'dera', 'boma', 'mudzi'];
    const lowerMsg = message.toLowerCase();
    for (const word of chichewaWords) {
        if (lowerMsg.includes(word)) {
            return 'chichewa';
        }
    }
    return 'english';
}

// Function to register or update farmer with language preference
async function registerFarmer(phoneNumber, message, language) {
    try {
        let cleanNumber = phoneNumber.trim();
        if (!cleanNumber.startsWith('+')) {
            cleanNumber = '+' + cleanNumber;
        }
        cleanNumber = cleanNumber.replace(/\s/g, '');
        
        const [existing] = await promisePool.query(
            'SELECT * FROM farmer_registrations WHERE phone_number = ?',
            [cleanNumber]
        );
        
        if (existing.length === 0) {
            let name = null, village = null, district = null;
            
            if (message.toLowerCase().startsWith('register') || message.toLowerCase().startsWith('lembetsani')) {
                const parts = message.substring(8).split(',');
                name = parts[0]?.trim();
                village = parts[1]?.trim();
                district = parts[2]?.trim();
            }
            
            await promisePool.query(
                `INSERT INTO farmer_registrations (phone_number, name, village, district, total_queries, language) 
                 VALUES (?, ?, ?, ?, 1, ?)`,
                [cleanNumber, name, village, district, language]
            );
            console.log(`✅ New farmer registered: ${cleanNumber} (${language})`);
            return true;
        } else {
            await promisePool.query(
                `UPDATE farmer_registrations 
                 SET total_queries = total_queries + 1, last_active = CURRENT_TIMESTAMP, language = ?
                 WHERE phone_number = ?`,
                [language, cleanNumber]
            );
            console.log(`✅ Existing farmer updated: ${cleanNumber}`);
            return false;
        }
    } catch (error) {
        console.error('Registration error:', error);
        return false;
    }
}

// Function to get price from database
async function getPrice(cropName) {
    try {
        const [rows] = await promisePool.query(
            `SELECT crop_name, price_per_kg, market_location 
             FROM prices 
             WHERE crop_name LIKE ? 
             LIMIT 1`,
            [`%${cropName}%`]
        );
        return rows[0];
    } catch (error) {
        console.error('Database error:', error);
        return null;
    }
}

// Function to get farmer stats
async function getFarmerStats(phoneNumber) {
    try {
        const [rows] = await promisePool.query(
            'SELECT total_queries, registered_date, last_active FROM farmer_registrations WHERE phone_number = ?',
            [phoneNumber]
        );
        return rows[0];
    } catch (error) {
        return null;
    }
}

// Function to send SMS reply with language support
async function sendReply(phoneNumber, message, language = 'english') {
    try {
        let formattedNumber = phoneNumber.trim();
        if (!formattedNumber.startsWith('+')) {
            formattedNumber = '+' + formattedNumber;
        }
        formattedNumber = formattedNumber.replace(/\s/g, '');
        
        console.log(`📤 Sending reply to: ${formattedNumber} (${language})`);
        console.log(`📤 Message: ${message}`);
        
        // For local testing, just log (uncomment below for real SMS)
        /*
        const result = await sms.send({
            to: [formattedNumber],
            message: message
        });
        
        await promisePool.query(
            'INSERT INTO messages (phone_number, direction, message) VALUES (?, ?, ?)',
            [formattedNumber, 'outgoing', message]
        );
        */
        
        console.log(`📤 Reply logged (test mode)`);
        return true;
    } catch (error) {
        console.error('Failed to send reply:', error.message);
        return null;
    }
}

// Main endpoint that receives SMS
app.post('/incoming-sms', async (req, res) => {
    console.log('📩 Incoming webhook:', req.body);
    
    let message = (req.body.text || req.body.message || '').toLowerCase().trim();
    let fromNumber = req.body.from || req.body.phoneNumber || '';
    fromNumber = fromNumber.trim();
    
    if (!fromNumber) {
        console.log('No phone number found');
        return res.send('OK');
    }
    
    console.log(`📱 From: ${fromNumber}`);
    console.log(`💬 Message: ${message}`);
    
    // Detect language
    const language = detectLanguage(message);
    console.log(`🌍 Language detected: ${language}`);
    
    // Register or update farmer
    await registerFarmer(fromNumber, message, language);
    
    // Log incoming message
    await promisePool.query(
        'INSERT INTO messages (phone_number, direction, message, language) VALUES (?, ?, ?, ?)',
        [fromNumber, 'incoming', message, language]
    );
    
    let replyMessage = '';
    
    // Chichewa commands mapping
    const chichewa = {
        maize: 'chimanga',
        tomatoes: 'mphonda',
        beans: 'nyemba',
        price: 'mtengo',
        help: 'thandizo',
        register: 'lembetsani',
        stats: 'chiwerengero'
    };
    
    // Handle based on language
    if (language === 'chichewa') {
        // Chichewa responses
        if (message.includes(chichewa.register) || message.startsWith('lembetsani')) {
            const stats = await getFarmerStats(fromNumber);
            replyMessage = `✅ Mwalembetsa! Mwafunsa ${stats?.total_queries || 1} nthawi. Tumizani CHIMANGA, MPHONDA, kapena NYEMBA kuti mudziwe mtengo.`;
        }
        else if (message.includes(chichewa.maize) || message.includes('chimanga')) {
            const price = await getPrice('maize');
            replyMessage = `🌽 Mtengo wa chimanga: MWK ${price?.price_per_kg || 350}/kg ku ${price?.market_location || 'Lilongwe'}`;
        }
        else if (message.includes(chichewa.tomatoes) || message.includes('mphonda')) {
            const price = await getPrice('tomatoes');
            replyMessage = `🍅 Mtengo wa mphonda: MWK ${price?.price_per_kg || 500}/kg ku ${price?.market_location || 'Lilongwe'}`;
        }
        else if (message.includes(chichewa.beans) || message.includes('nyemba')) {
            const price = await getPrice('beans');
            replyMessage = `🫘 Mtengo wa nyemba: MWK ${price?.price_per_kg || 800}/kg ku ${price?.market_location || 'Lilongwe'}`;
        }
        else if (message.includes(chichewa.stats) || message.includes('chiwerengero')) {
            const stats = await getFarmerStats(fromNumber);
            if (stats) {
                replyMessage = `📊 Chiwerengero chanu: Mwafunsa ${stats.total_queries} nthawi kuyambira ${new Date(stats.registered_date).toLocaleDateString()}`;
            } else {
                replyMessage = `Lembetsani dzina lanu: LEMBETSA John Banda`;
            }
        }
        else if (message.includes(chichewa.help) || message.includes('thandizo')) {
            replyMessage = `📋 Mawu:\n- CHIMANGA\n- MPHONDA\n- NYEMBA\n- CHIWERENGERO\n- LEMBETSA Dzina lako`;
        }
        else {
            replyMessage = `📋 Tumizani CHIMANGA, MPHONDA, kapena NYEMBA. Tumizani THANDIZO kuti muwone mawu onse.`;
        }
    } 
    else {
        // English responses (original)
        if (message.startsWith('register')) {
            const stats = await getFarmerStats(fromNumber);
            replyMessage = `✅ You are registered! You've made ${stats?.total_queries || 1} queries. Send PRICE MAIZE, PRICE TOMATOES, or PRICE BEANS.`;
        }
        else if (message.includes('maize')) {
            const price = await getPrice('maize');
            replyMessage = `🌽 Maize price: MWK ${price?.price_per_kg || 350}/kg at ${price?.market_location || 'Lilongwe Market'}`;
        }
        else if (message.includes('tomatoes')) {
            const price = await getPrice('tomatoes');
            replyMessage = `🍅 Tomatoes: MWK ${price?.price_per_kg || 500}/kg at ${price?.market_location || 'Lilongwe Market'}`;
        }
        else if (message.includes('beans')) {
            const price = await getPrice('beans');
            replyMessage = `🫘 Beans: MWK ${price?.price_per_kg || 800}/kg at ${price?.market_location || 'Lilongwe Market'}`;
        }
        else if (message.includes('my stats')) {
            const stats = await getFarmerStats(fromNumber);
            if (stats) {
                replyMessage = `📊 Your stats: ${stats.total_queries} queries since ${new Date(stats.registered_date).toLocaleDateString()}`;
            } else {
                replyMessage = `Send REGISTER Your Name to sign up!`;
            }
        }
        else if (message.includes('help')) {
            replyMessage = `📋 Commands:\n- PRICE MAIZE\n- PRICE TOMATOES\n- PRICE BEANS\n- MY STATS\n- REGISTER Your Name\n\n🇲🇼 For Chichewa: CHIMANGA, MPHONDA, NYEMBA, CHIWERENGERO, LEMBETSA`;
        }
        else {
            replyMessage = `📋 Send PRICE MAIZE, PRICE TOMATOES, or PRICE BEANS. Send HELP for all commands.\n\n🇲🇼 Chichewa: TUMIZANI CHIMANGA, MPHONDA, kapena NYEMBA.`;
        }
    }
    
    await sendReply(fromNumber, replyMessage, language);
    res.send('OK');
});

// Health check
app.get('/health', (req, res) => {
    res.send('✅ Server is running');
});

app.get('/farmers', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM farmer_registrations ORDER BY last_active DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ SMS receiver server running on http://localhost:${PORT}`);
    console.log(`📡 Waiting for incoming SMS...`);
    console.log(`🌍 Languages supported: English and Chichewa`);
});