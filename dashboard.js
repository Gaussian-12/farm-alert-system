require('dotenv').config();
const express = require('express');
const path = require('path');
const { promisePool, testConnection } = require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────

// Redirect root → dashboard
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', async (req, res) => {
    try {
        const [[{ count: totalFarmers }]] = await promisePool.query('SELECT COUNT(*) as count FROM farmer_registrations');
        const [[{ count: totalMessages }]] = await promisePool.query('SELECT COUNT(*) as count FROM messages');
        const [[{ count: activeToday }]] = await promisePool.query(
            'SELECT COUNT(*) as count FROM farmer_registrations WHERE DATE(last_active) = CURDATE()'
        );
        const [[{ sum: totalQueries }]] = await promisePool.query(
            'SELECT SUM(total_queries) as sum FROM farmer_registrations'
        );
        const [[{ count: recentMessages }]] = await promisePool.query(
            'SELECT COUNT(*) as count FROM messages WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)'
        );
        const [recentFarmers] = await promisePool.query(
            'SELECT * FROM farmer_registrations ORDER BY registered_date DESC LIMIT 5'
        );
        const [recentMsgs] = await promisePool.query(
            'SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10'
        );

        // Most queried crop
        const [popularCropResult] = await promisePool.query(
            `SELECT message FROM messages WHERE direction='incoming'
             AND (message LIKE '%maize%' OR message LIKE '%tomato%' OR message LIKE '%bean%' OR message LIKE '%groundnut%' OR message LIKE '%rice%')
             GROUP BY message ORDER BY COUNT(*) DESC LIMIT 1`
        );
        let popularCrop = null;
        if (popularCropResult.length > 0) {
            const m = popularCropResult[0].message.toLowerCase();
            if (m.includes('maize')) popularCrop = 'Maize';
            else if (m.includes('tomato')) popularCrop = 'Tomatoes';
            else if (m.includes('bean')) popularCrop = 'Beans';
            else if (m.includes('groundnut')) popularCrop = 'Groundnuts';
            else if (m.includes('rice')) popularCrop = 'Rice';
        }

        res.render('dashboard', {
            totalFarmers,
            totalMessages,
            activeToday,
            totalQueries: totalQueries || 0,
            popularCrop,
            recentMessages,
            recentFarmers,
            recentMsgs,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error loading dashboard: ' + error.message);
    }
});

app.get('/farmers', async (req, res) => {
    try {
        const [farmers] = await promisePool.query('SELECT * FROM farmer_registrations ORDER BY registered_date DESC');
        res.render('farmers', { farmers, success: req.query.success || null, error: req.query.error || null });
    } catch (error) {
        res.status(500).send('Error loading farmers: ' + error.message);
    }
});

// Delete farmer
app.post('/delete-farmer', async (req, res) => {
    const { id } = req.body;
    try {
        await promisePool.query('DELETE FROM farmer_registrations WHERE id = ?', [id]);
        res.redirect('/farmers?success=Farmer removed');
    } catch (error) {
        res.redirect('/farmers?error=Failed to remove farmer');
    }
});

app.get('/messages', async (req, res) => {
    try {
        const [messages] = await promisePool.query('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 200');
        res.render('messages', { messages, success: req.query.success || null, error: req.query.error || null });
    } catch (error) {
        res.status(500).send('Error loading messages: ' + error.message);
    }
});

app.get('/broadcast', async (req, res) => {
    try {
        const [[{ count }]] = await promisePool.query('SELECT COUNT(*) as count FROM farmer_registrations');
        res.render('broadcast', { farmerCount: count, success: req.query.success || null, error: req.query.error || null });
    } catch (error) {
        res.status(500).send('Error loading broadcast: ' + error.message);
    }
});

app.post('/send-broadcast', async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
        return res.redirect('/broadcast?error=Message is required');
    }

    try {
        const [farmers] = await promisePool.query('SELECT phone_number FROM farmer_registrations');

        // Africa's Talking SMS client
        const africastalking = require('africastalking');
        const atClient = africastalking({ apiKey: process.env.API_KEY, username: process.env.USERNAME });
        const smsSvc = atClient.SMS;

        let sent = 0;
        for (const farmer of farmers) {
            try {
                await smsSvc.send({ to: [farmer.phone_number], message: `[FarmAlert] ${message}` });
                await promisePool.query(
                    'INSERT INTO messages (phone_number, direction, message) VALUES (?, ?, ?)',
                    [farmer.phone_number, 'outgoing', `[BROADCAST] ${message}`]
                );
                sent++;
            } catch (e) {
                console.error(`Failed to send to ${farmer.phone_number}:`, e.message);
            }
        }

        res.redirect(`/broadcast?success=Broadcast sent to ${sent} of ${farmers.length} farmers`);
    } catch (error) {
        console.error('Broadcast error:', error);
        res.redirect('/broadcast?error=Failed to send broadcast');
    }
});

app.get('/prices', async (req, res) => {
    try {
        const [prices] = await promisePool.query('SELECT * FROM prices ORDER BY crop_name, market_location');
        res.render('prices', { prices, success: req.query.success || null, error: req.query.error || null });
    } catch (error) {
        res.status(500).send('Error loading prices: ' + error.message);
    }
});

app.post('/add-price', async (req, res) => {
    const { crop_name, price_per_kg, market_location } = req.body;
    if (!crop_name || !price_per_kg || !market_location) {
        return res.redirect('/prices?error=All fields are required');
    }
    try {
        await promisePool.query(
            'INSERT INTO prices (crop_name, price_per_kg, market_location) VALUES (?, ?, ?)',
            [crop_name.toLowerCase().trim(), parseFloat(price_per_kg), market_location.trim()]
        );
        res.redirect('/prices?success=Price added successfully');
    } catch (error) {
        res.redirect('/prices?error=Failed to add price: ' + error.message);
    }
});

app.post('/update-price', async (req, res) => {
    const { id, price_per_kg, market_location } = req.body;
    try {
        await promisePool.query(
            'UPDATE prices SET price_per_kg = ?, market_location = ? WHERE id = ?',
            [parseFloat(price_per_kg), market_location.trim(), id]
        );
        res.redirect('/prices?success=Price updated successfully');
    } catch (error) {
        res.redirect('/prices?error=Failed to update price');
    }
});

app.post('/delete-price', async (req, res) => {
    const { id } = req.body;
    try {
        await promisePool.query('DELETE FROM prices WHERE id = ?', [id]);
        res.redirect('/prices?success=Price deleted successfully');
    } catch (error) {
        res.redirect('/prices?error=Failed to delete price');
    }
});

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────

const PORT = process.env.DASHBOARD_PORT || 3001;

async function start() {
    const ok = await testConnection();
    if (!ok) {
        console.error('❌ Aborting: could not connect to database.');
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`✅ Web Dashboard running on http://localhost:${PORT}`);
        console.log(`📊 Open your browser: http://localhost:${PORT}/dashboard`);
    });
}

start();
