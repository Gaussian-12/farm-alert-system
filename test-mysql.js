const { promisePool, testConnection } = require('./db');

async function test() {
    const connected = await testConnection();
    if (connected) {
        const [rows] = await promisePool.query('SELECT * FROM prices');
        console.log('📊 Current crop prices:');
        console.table(rows);
    }
}

test();