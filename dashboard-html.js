require('dotenv').config();
const express = require('express');
const path = require('path');
const { promisePool } = require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

function htmlTemplate(content, title = 'Farm Alert Dashboard') {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        nav { background: #2e7d32; color: white; padding: 15px 0; margin-bottom: 30px; }
        nav .container { display: flex; justify-content: space-between; align-items: center; }
        nav h1 { font-size: 1.5rem; }
        nav ul { display: flex; list-style: none; gap: 20px; }
        nav ul li a { color: white; text-decoration: none; padding: 8px 15px; border-radius: 5px; }
        nav ul li a:hover { background: #1b5e20; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .stat-card .number { font-size: 2.5rem; font-weight: bold; color: #2e7d32; }
        table { width: 100%; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-collapse: collapse; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #2e7d32; color: white; }
        tr:hover { background: #f5f5f5; }
        button, .btn { background: #2e7d32; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        input, select, textarea { width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 5px; }
        .form-group { margin-bottom: 20px; }
        h2, h3 { margin-bottom: 20px; }
        .alert-box { background: #e3f2fd; padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 5px solid #2196f3; }
        .success { background: #d4edda; border-left-color: #28a745; }
        .error { background: #f8d7da; border-left-color: #dc3545; }
    </style>
</head>
<body>
    <nav>
        <div class="container">
            <h1>🌾 Farm Alert Malawi</h1>
            <ul>
                <li><a href="/dashboard">Dashboard</a></li>
                <li><a href="/farmers">Farmers</a></li>
                <li><a href="/messages">Messages</a></li>
                <li><a href="/broadcast">Broadcast</a></li>
                <li><a href="/prices">Prices</a></li>
            </ul>
        </div>
    </nav>
    <div class="container">
        ${content}
    </div>
</body>
</html>
    `;
}

// Dashboard home
app.get('/dashboard', async (req, res) => {
    try {
        const [totalFarmers] = await promisePool.query("SELECT COUNT(*) as count FROM farmer_registrations");
        const [totalMessages] = await promisePool.query("SELECT COUNT(*) as count FROM messages");
        const [activeToday] = await promisePool.query("SELECT COUNT(*) as count FROM farmer_registrations WHERE DATE(last_active) = CURDATE()");
        const [totalQueries] = await promisePool.query("SELECT SUM(total_queries) as sum FROM farmer_registrations");
        const [recentFarmers] = await promisePool.query("SELECT * FROM farmer_registrations ORDER BY registered_date DESC LIMIT 5");
        const [recentAlerts] = await promisePool.query(
            "SELECT * FROM messages WHERE message LIKE '[WEATHER%' OR message LIKE '🌧%' OR message LIKE '☀️%' ORDER BY timestamp DESC LIMIT 5"
        );
        
        const content = `
            <h2>Dashboard</h2>
            <div class="stats-grid">
                <div class="stat-card"><h3>Total Farmers</h3><div class="number">${totalFarmers[0].count}</div></div>
                <div class="stat-card"><h3>Total Messages</h3><div class="number">${totalMessages[0].count}</div></div>
                <div class="stat-card"><h3>Active Today</h3><div class="number">${activeToday[0].count}</div></div>
                <div class="stat-card"><h3>Total Queries</h3><div class="number">${totalQueries[0].sum || 0}</div></div>
            </div>
            
            <h3>🌧️ Recent Weather Alerts</h3>
            ${recentAlerts.length > 0 ? `
            <div class="alert-box">
                <ul>
                    ${recentAlerts.map(a => `
                        <li><strong>${new Date(a.timestamp).toLocaleString()}</strong> - ${a.message.substring(0, 100)}${a.message.length > 100 ? '...' : ''}</li>
                    `).join('')}
                </ul>
            </div>
            ` : '<p>No weather alerts sent yet.</p>'}
            
            <h3>Recent Farmers</h3>
            <table>
                <thead><tr><th>Phone</th><th>Name</th><th>Village</th><th>Queries</th><th>Registered</th></tr></thead>
                <tbody>
                    ${recentFarmers.map(f => `<tr><td>${f.phone_number}</td><td>${f.name || 'Not set'}</td><td>${f.village || 'Not set'}</td><td>${f.total_queries}</td><td>${new Date(f.registered_date).toLocaleDateString()}</td>`).join('')}
                    ${recentFarmers.length === 0 ? '<tr><td colspan="5">No farmers registered yet</td></tr>' : ''}
                </tbody>
            </table>
        `;
        res.send(htmlTemplate(content));
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});

// Farmers page
app.get('/farmers', async (req, res) => {
    try {
        const [farmers] = await promisePool.query("SELECT * FROM farmer_registrations ORDER BY registered_date DESC");
        const content = `
            <h2>Registered Farmers</h2>
            <div class="search-box"><input type="text" id="searchInput" placeholder="Search by phone or name..." style="width: 300px; display: inline-block; margin-right: 10px;"></div>
            <table>
                <thead><tr><th>Phone</th><th>Name</th><th>Village</th><th>District</th><th>Queries</th><th>Last Active</th><th>Registered</th></tr></thead>
                <tbody id="farmersTable">
                    ${farmers.map(f => `<tr><td>${f.phone_number}</td><td>${f.name || 'Not set'}</td><td>${f.village || 'Not set'}</td><td>${f.district || 'Not set'}</td><td>${f.total_queries}</td><td>${new Date(f.last_active).toLocaleString()}</td><td>${new Date(f.registered_date).toLocaleDateString()}</td></tr>`).join('')}
                    ${farmers.length === 0 ? '<tr><td colspan="7">No farmers registered yet</td></tr>' : ''}
                </tbody>
            </table>
            <script>
                document.getElementById('searchInput')?.addEventListener('keyup', function() {
                    const searchValue = this.value.toLowerCase();
                    document.querySelectorAll('#farmersTable tr').forEach(row => {
                        row.style.display = row.textContent.toLowerCase().includes(searchValue) ? '' : 'none';
                    });
                });
            </script>
        `;
        res.send(htmlTemplate(content, "Farmers - Farm Alert"));
    } catch (error) {
        res.status(500).send("Error loading farmers");
    }
});

// Messages page
app.get('/messages', async (req, res) => {
    try {
        const [messages] = await promisePool.query("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100");
        const content = `
            <h2>All Messages</h2>
            <table>
                <thead><tr><th>Phone</th><th>Direction</th><th>Message</th><th>Time</th></tr></thead>
                <tbody>
                    ${messages.map(m => `<tr><td>${m.phone_number}</td><td>${m.direction === 'incoming' ? '📩 Incoming' : '📤 Outgoing'}</td><td>${m.message}</td><td>${new Date(m.timestamp).toLocaleString()}</td></tr>`).join('')}
                    ${messages.length === 0 ? '<tr><td colspan="4">No messages yet</td></tr>' : ''}
                </tbody>
            </table>
        `;
        res.send(htmlTemplate(content, "Messages - Farm Alert"));
    } catch (error) {
        res.status(500).send("Error loading messages");
    }
});

// Broadcast page with weather alerts
app.get('/broadcast', async (req, res) => {
    try {
        const [farmers] = await promisePool.query("SELECT COUNT(*) as count FROM farmer_registrations");
        const success = req.query.success || '';
        const error = req.query.error || '';
        
        const successHtml = success ? `<div class="alert-box success">✅ ${success}</div>` : '';
        const errorHtml = error ? `<div class="alert-box error">❌ ${error}</div>` : '';
        
        const content = `
            <h2>Send Broadcast Message</h2>
            ${successHtml}
            ${errorHtml}
            
            <div class="alert-box">
                <h3>🌧️ Quick Weather Alert</h3>
                <form method="POST" action="/send-weather-alert">
                    <div class="form-group">
                        <label>Weather Alert Type:</label>
                        <select name="weather_type" id="weatherType">
                            <option value="rain">🌧️ Heavy Rain Alert</option>
                            <option value="dry">☀️ Dry Spell Alert</option>
                            <option value="storm">⛈️ Storm Warning</option>
                            <option value="flood">🌊 Flood Warning</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Affected Region:</label>
                        <select name="region">
                            <option value="Central Region">Central Region</option>
                            <option value="Southern Region">Southern Region</option>
                            <option value="Northern Region">Northern Region</option>
                            <option value="All Regions">All Regions</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Custom Message:</label>
                        <textarea name="message" id="weatherMessage" rows="3" required></textarea>
                    </div>
                    <button type="submit" style="background: #2196f3;">🌧️ Send Weather Alert</button>
                </form>
            </div>
            
            <h3>📢 General Broadcast</h3>
            <form method="POST" action="/send-broadcast">
                <div class="form-group"><label>Farmers to receive: ${farmers[0].count}</label></div>
                <div class="form-group"><label>Message:</label><textarea name="message" rows="5" required placeholder="Type your broadcast message here..."></textarea></div>
                <button type="submit">Send Broadcast</button>
            </form>
            
            <script>
                function updateWeatherMessage() {
                    const type = document.getElementById('weatherType').value;
                    const region = document.querySelector('select[name="region"]').value;
                    let message = '';
                    switch(type) {
                        case 'rain':
                            message = '🌧️ HEAVY RAIN ALERT: Heavy rains expected in ' + region + ' tomorrow. Farmers are advised to secure their harvest and avoid flooding areas. - Farm Alert Malawi';
                            break;
                        case 'dry':
                            message = '☀️ DRY SPELL ALERT: Dry conditions expected in ' + region + ' for the coming week. Conserve water and plan irrigation. - Farm Alert Malawi';
                            break;
                        case 'storm':
                            message = '⛈️ STORM WARNING: Severe storms expected in ' + region + ' within 24 hours. Secure livestock and property immediately! - Farm Alert Malawi';
                            break;
                        case 'flood':
                            message = '🌊 FLOOD WARNING: Flooding expected in ' + region + ' low-lying areas. Move to higher ground immediately! - Farm Alert Malawi';
                            break;
                    }
                    document.getElementById('weatherMessage').value = message;
                }
                updateWeatherMessage();
                document.getElementById('weatherType').addEventListener('change', updateWeatherMessage);
                document.querySelector('select[name="region"]').addEventListener('change', updateWeatherMessage);
            </script>
        `;
        res.send(htmlTemplate(content, "Broadcast - Farm Alert"));
    } catch (error) {
        res.status(500).send("Error loading broadcast: " + error.message);
    }
});

// Send weather alert
app.post('/send-weather-alert', async (req, res) => {
    const { message, weather_type, region } = req.body;
    
    try {
        const [farmers] = await promisePool.query("SELECT phone_number FROM farmer_registrations");
        
        if (farmers.length === 0) {
            return res.redirect('/broadcast?error=No farmers registered');
        }
        
        for (const farmer of farmers) {
            await promisePool.query(
                "INSERT INTO messages (phone_number, direction, message) VALUES (?, ?, ?)",
                [farmer.phone_number, "outgoing", `[WEATHER] ${message}`]
            );
        }
        
        res.redirect('/broadcast?success=Weather alert sent to ' + farmers.length + ' farmers (logged to database)');
        
    } catch (error) {
        console.error(error);
        res.redirect('/broadcast?error=Failed to send weather alert');
    }
});

// Send regular broadcast
app.post('/send-broadcast', async (req, res) => {
    const { message } = req.body;
    try {
        const [farmers] = await promisePool.query("SELECT phone_number FROM farmer_registrations");
        
        if (farmers.length === 0) {
            return res.redirect('/broadcast?error=No farmers registered');
        }
        
        for (const farmer of farmers) {
            await promisePool.query(
                "INSERT INTO messages (phone_number, direction, message) VALUES (?, ?, ?)",
                [farmer.phone_number, "outgoing", `[BROADCAST] ${message}`]
            );
        }
        res.redirect('/broadcast?success=Broadcast sent to ' + farmers.length + ' farmers');
    } catch (error) {
        res.redirect('/broadcast?error=Failed to send broadcast');
    }
});

// Prices page
app.get('/prices', async (req, res) => {
    try {
        const [prices] = await promisePool.query("SELECT * FROM prices ORDER BY crop_name");
        const success = req.query.success || '';
        const error = req.query.error || '';
        
        const successHtml = success ? `<div class="alert-box success">✅ ${success}</div>` : '';
        const errorHtml = error ? `<div class="alert-box error">❌ ${error}</div>` : '';
        
        const content = `
            <h2>Manage Crop Prices</h2>
            ${successHtml}
            ${errorHtml}
            
            <h3>Add New Price</h3>
            <form method="POST" action="/add-price">
                <input type="text" name="crop_name" placeholder="Crop Name (e.g., Rice)" required>
                <input type="number" name="price_per_kg" placeholder="Price per kg (MWK)" required>
                <input type="text" name="market_location" placeholder="Market Location (e.g., Lilongwe)" required>
                <button type="submit">Add Price</button>
            </form>
            
            <h3>Current Prices</h3>
            <table>
                <thead><tr><th>Crop</th><th>Price (MWK/kg)</th><th>Market</th><th>Last Updated</th><th>Actions</th></tr></thead>
                <tbody>
                    ${prices.map(p => `
                        <tr>
                            <td>${p.crop_name}</td>
                            <td>MWK ${p.price_per_kg}</td>
                            <td>${p.market_location}</td>
                            <td>${new Date(p.date_updated).toLocaleDateString()}</td>
                            <td>
                                <form method="POST" action="/delete-price" style="display:inline;">
                                    <input type="hidden" name="id" value="${p.id}">
                                    <button type="submit" style="background:#dc3545;">Delete</button>
                                </form>
                            </td>
                        </tr>
                    `).join('')}
                    ${prices.length === 0 ? '<tr><td colspan="5">No prices added yet</td></tr>' : ''}
                </tbody>
            </table>
        `;
        res.send(htmlTemplate(content, "Prices - Farm Alert"));
    } catch (error) {
        res.status(500).send("Error loading prices: " + error.message);
    }
});

// Add price
app.post('/add-price', async (req, res) => {
    const { crop_name, price_per_kg, market_location } = req.body;
    try {
        await promisePool.query(
            "INSERT INTO prices (crop_name, price_per_kg, market_location) VALUES (?, ?, ?)",
            [crop_name, price_per_kg, market_location]
        );
        res.redirect('/prices?success=Price added successfully');
    } catch (error) {
        res.redirect('/prices?error=Failed to add price');
    }
});

// Delete price
app.post('/delete-price', async (req, res) => {
    const { id } = req.body;
    try {
        await promisePool.query("DELETE FROM prices WHERE id = ?", [id]);
        res.redirect('/prices?success=Price deleted successfully');
    } catch (error) {
        res.redirect('/prices?error=Failed to delete price');
    }
});

// Redirect root to dashboard
app.get('/', (req, res) => res.redirect('/dashboard'));

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`✅ Web Dashboard running on http://localhost:${PORT}`);
    console.log(`📊 Open your browser and go to: http://localhost:3001`);
});