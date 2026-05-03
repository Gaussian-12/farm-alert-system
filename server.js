require('dotenv').config();
const express = require('express');
const { promisePool, testConnection } = require('./db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Africa's Talking SMS client
const africastalking = require('africastalking');
const atClient = africastalking({
    apiKey: process.env.API_KEY,
    username: process.env.USERNAME
});
const sms = atClient.SMS;

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function cleanPhone(number) {
    let n = (number || '').trim().replace(/\s/g, '');
    if (!n.startsWith('+')) n = '+' + n;
    return n;
}

async function getPrice(cropName) {
    try {
        const [rows] = await promisePool.query(
            'SELECT crop_name, price_per_kg, market_location FROM prices WHERE LOWER(crop_name) LIKE ? LIMIT 3',
            [`%${cropName.toLowerCase()}%`]
        );
        return rows;
    } catch (error) {
        console.error('DB getPrice error:', error.message);
        return [];
    }
}

async function registerOrUpdateFarmer(phoneNumber, message) {
    try {
        const [existing] = await promisePool.query(
            'SELECT id, total_queries FROM farmer_registrations WHERE phone_number = ?',
            [phoneNumber]
        );

        if (existing.length === 0) {
            // Extract name if sent as "REGISTER John Banda"
            let name = null;
            const lower = message.toLowerCase();
            if (lower.startsWith('register')) {
                name = message.substring(8).trim() || null;
            }
            await promisePool.query(
                'INSERT INTO farmer_registrations (phone_number, name, total_queries) VALUES (?, ?, 1)',
                [phoneNumber, name]
            );
            console.log(`✅ New farmer registered: ${phoneNumber}${name ? ' (' + name + ')' : ''}`);
            return { isNew: true, queries: 1 };
        } else {
            const newCount = existing[0].total_queries + 1;
            await promisePool.query(
                'UPDATE farmer_registrations SET total_queries = ?, last_active = CURRENT_TIMESTAMP WHERE phone_number = ?',
                [newCount, phoneNumber]
            );
            return { isNew: false, queries: newCount };
        }
    } catch (error) {
        console.error('registerOrUpdateFarmer error:', error.message);
        return { isNew: false, queries: 0 };
    }
}

async function getFarmerStats(phoneNumber) {
    try {
        const [rows] = await promisePool.query(
            'SELECT name, total_queries, registered_date, last_active FROM farmer_registrations WHERE phone_number = ?',
            [phoneNumber]
        );
        return rows[0] || null;
    } catch (error) {
        return null;
    }
}

async function logMessage(phoneNumber, direction, message) {
    try {
        await promisePool.query(
            'INSERT INTO messages (phone_number, direction, message) VALUES (?, ?, ?)',
            [phoneNumber, direction, message]
        );
    } catch (error) {
        console.error('logMessage error:', error.message);
    }
}

// FIX: correct Africa's Talking sms.send() signature
async function sendReply(phoneNumber, message) {
    try {
        const result = await sms.send({
            to: [phoneNumber],
            message: message
        });
        await logMessage(phoneNumber, 'outgoing', message);
        console.log(`📤 Reply sent to ${phoneNumber}`);
        return result;
    } catch (error) {
        console.error('sendReply error:', error.message);
        // Still log the attempted outgoing message
        await logMessage(phoneNumber, 'outgoing', '[FAILED] ' + message);
        return null;
    }
}

function formatPriceList(cropEmoji, cropLabel, prices) {
    if (prices.length === 0) {
        return `${cropEmoji} No ${cropLabel} prices found. Contact your local market.`;
    }
    let msg = `${cropEmoji} ${cropLabel} prices:\n`;
    prices.forEach(p => {
        msg += `• MWK ${parseFloat(p.price_per_kg).toLocaleString()}/kg — ${p.market_location}\n`;
    });
    return msg.trim();
}

// ─────────────────────────────────────────────
//  MAIN SMS HANDLER
// ─────────────────────────────────────────────

app.post('/incoming-sms', async (req, res) => {
    console.log('📩 Incoming webhook payload:', req.body);

    const rawMessage = (req.body.text || req.body.message || '').trim();
    const rawFrom = req.body.from || req.body.phoneNumber || req.body.From || '';

    if (!rawFrom) {
        console.warn('⚠️  No sender phone number in request');
        return res.status(200).send('OK');
    }

    const fromNumber = cleanPhone(rawFrom);
    const message = rawMessage.toLowerCase().trim();

    console.log(`📱 From: ${fromNumber}`);
    console.log(`💬 Message: "${rawMessage}"`);

    // Log incoming
    await logMessage(fromNumber, 'incoming', rawMessage);

    // Register / update farmer query count
    const farmerInfo = await registerOrUpdateFarmer(fromNumber, rawMessage);

    let reply = '';

    // ── Command routing ──────────────────────────────────────────
    if (message.startsWith('register')) {
        const stats = await getFarmerStats(fromNumber);
        const greeting = stats?.name ? `Welcome, ${stats.name}!` : 'You are registered!';
        reply = `✅ ${greeting} You have made ${stats?.total_queries || 1} queries.\n\nSend PRICE MAIZE, PRICE TOMATOES, PRICE BEANS, or HELP.`;
    }
    else if (message.includes('maize')) {
        const prices = await getPrice('maize');
        reply = formatPriceList('🌽', 'Maize', prices);
    }
    else if (message.includes('tomato')) {
        const prices = await getPrice('tomatoes');
        reply = formatPriceList('🍅', 'Tomatoes', prices);
    }
    else if (message.includes('bean')) {
        const prices = await getPrice('beans');
        reply = formatPriceList('🫘', 'Beans', prices);
    }
    else if (message.includes('groundnut') || message.includes('peanut')) {
        const prices = await getPrice('groundnuts');
        reply = formatPriceList('🥜', 'Groundnuts', prices);
    }
    else if (message.includes('rice')) {
        const prices = await getPrice('rice');
        reply = formatPriceList('🍚', 'Rice', prices);
    }
    else if (message.includes('my stats') || message === 'stats') {
        const stats = await getFarmerStats(fromNumber);
        if (stats) {
            const since = new Date(stats.registered_date).toLocaleDateString('en-GB');
            reply = `📊 Your stats:\nName: ${stats.name || 'Not set'}\nQueries: ${stats.total_queries}\nMember since: ${since}`;
        } else {
            reply = `You are not registered yet. Send REGISTER Your Name to sign up.`;
        }
    }
    else if (message === 'help' || message === 'menu') {
        reply = `📋 FarmAlert Commands:\n• PRICE MAIZE\n• PRICE TOMATOES\n• PRICE BEANS\n• PRICE GROUNDNUTS\n• PRICE RICE\n• MY STATS\n• REGISTER Your Name\n\nPowered by FarmAlert Malawi`;
    }
    else {
        reply = `📋 Send PRICE MAIZE, PRICE TOMATOES, or PRICE BEANS for market prices.\nSend HELP to see all commands.`;
    }

    await sendReply(fromNumber, reply);
    res.status(200).send('OK');
});

// ─────────────────────────────────────────────
//  UTILITY ENDPOINTS
// ─────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/farmers', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM farmer_registrations ORDER BY last_active DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────

const PORT = process.env.SMS_PORT || 3000;

async function start() {
    const ok = await testConnection();
    if (!ok) {
        console.error('❌ Aborting: could not connect to database. Check your .env file.');
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`✅ SMS server running on http://localhost:${PORT}`);
        console.log(`📡 Africa's Talking webhook URL: http://YOUR_SERVER_IP:${PORT}/incoming-sms`);
        console.log(`   Health check: http://localhost:${PORT}/health`);
    });
}

start();
