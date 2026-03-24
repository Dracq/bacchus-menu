const { createClient } = require('redis');

let client = null;

async function getRedisClient() {
    if (!client) {
        client = createClient({
            url: process.env.REDIS_URL || process.env.KV_URL
        });
        client.on('error', err => console.error('Redis Client Error', err));
        await client.connect();
    }
    return client;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const redisClient = await getRedisClient();
        const data = req.body;
        const table = data.table;

        if (!table) {
            return res.status(400).json({ error: "Table number required" });
        }

        const key = `table:${table}`;
        const rawData = await redisClient.get(key);
        const existing = rawData ? JSON.parse(rawData) : null;

        if (!existing || existing.type !== 'ORDER') {
            await redisClient.set(key, JSON.stringify({
                type: 'WAITER',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
            }));
        }
        
        console.log(`[WAITER] Table ${table} calling`);
        return res.status(200).json({ success: true, message: "Waiter notified" });
    } catch (error) {
        console.error('Waiter Error:', error);
        return res.status(500).json({ error: 'Failed to call waiter' });
    }
};
