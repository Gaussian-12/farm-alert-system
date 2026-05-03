# 🌱 FarmAlert Malawi — SMS Agricultural System

An SMS-based crop price information system for Malawian farmers, built with Node.js + MySQL + Africa's Talking.

## System Overview

- **SMS Server** (port 3000) — Receives farmer SMS via Africa's Talking webhook, replies with crop prices
- **Web Dashboard** (port 3001) — Admin panel to manage farmers, prices, and send broadcasts

---

## 🚀 Setup (Step by Step)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Your `.env` file is already set up. Edit it if needed:
```
API_KEY=your_africas_talking_api_key
USERNAME=sandbox  # Change to your AT username in production
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=farm_system
```

### 3. Make sure MySQL is running
```bash
# On Windows: start MySQL service from Services panel
# On Linux/Mac:
sudo service mysql start
```

### 4. Create database and tables
```bash
node setup-db.js
```
This creates all tables and seeds initial crop prices automatically.

### 5. Verify setup
```bash
node test-env.js      # Check environment variables
node test-mysql.js    # Check database connection and data
```

---

## ▶️ Running the System

### Start SMS Server (terminal 1)
```bash
npm start
# or: node server.js
# Runs on http://localhost:3000
```

### Start Web Dashboard (terminal 2)
```bash
node dashboard.js
# Open browser: http://localhost:3001
```

---

## 📡 Africa's Talking Webhook Setup

1. Log in to https://account.africastalking.com
2. Go to SMS → Inbox → Manage Keywords (or Callback URL)
3. Set your callback URL to: `http://YOUR_SERVER_IP:3000/incoming-sms`
4. Use ngrok for local testing: `ngrok http 3000`
   Then set webhook to: `https://xxxx.ngrok.io/incoming-sms`

---

## 💬 SMS Commands (Farmer Interface)

| Command | Response |
|---------|----------|
| `PRICE MAIZE` | Maize prices from all markets |
| `PRICE TOMATOES` | Tomato prices |
| `PRICE BEANS` | Bean prices |
| `PRICE GROUNDNUTS` | Groundnut prices |
| `PRICE RICE` | Rice prices |
| `REGISTER John Banda` | Register with name |
| `MY STATS` | Your query count and join date |
| `HELP` | All available commands |

---

## 🗄️ Database Schema

```sql
farmer_registrations  -- id, phone_number, name, registered_date, last_active, total_queries
messages              -- id, phone_number, direction, message, timestamp
prices                -- id, crop_name, price_per_kg, market_location, updated_at
```

---

## 🧪 Testing

### Send a test SMS
```bash
node send-sms.js
```

### Test the webhook locally
```bash
curl -X POST http://localhost:3000/incoming-sms \
  -d "from=+265998984634&text=PRICE MAIZE"
```

### Health check
```bash
curl http://localhost:3000/health
```
