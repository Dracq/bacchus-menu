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
        const { table } = req.query;

        if (!table) {
            return res.status(400).json({ error: "Table number required" });
        }

        await redisClient.del(`table:${table}`);
        console.log(`[RESOLVED] Table ${table} cleared`);
        
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Resolve Error:', error);
        return res.status(500).json({ error: 'Failed to resolve table' });
    }
};
