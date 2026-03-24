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
        const keys = await redisClient.keys('table:*');

        if (keys.length > 0) {
            await redisClient.del(keys);
        }

        console.log(`[CLEAR_ALL] Cleared ${keys.length} table request(s)`);
        return res.status(200).json({ success: true, cleared: keys.length });
    } catch (error) {
        console.error('Clear All Error:', error);
        return res.status(500).json({ error: 'Failed to clear all requests' });
    }
};
