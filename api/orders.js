const { createClient } = require('redis');

// Create Redis client (connection is reused across warm starts)
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const redisClient = await getRedisClient();

    // GET: Fetch all active orders
    if (req.method === 'GET') {
        try {
            const keys = await redisClient.keys('table:*');

            if (keys.length === 0) {
                return res.status(200).json({});
            }

            const values = await redisClient.mGet(keys);
            const result = {};
            
            keys.forEach((key, index) => {
                const tableNum = key.split(':')[1];
                result[tableNum] = values[index] ? JSON.parse(values[index]) : null;
            });

            return res.status(200).json(result);
        } catch (error) {
            console.error('GET Error:', error);
            return res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
        }
    }

    // POST: Create new order
    if (req.method === 'POST') {
        try {
            const data = req.body;
            const table = data.table;
            
            if (!table) {
                return res.status(400).json({ error: "Table number required" });
            }

            const newOrder = {
                items: data.items,
                total: data.total,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
            };

            const key = `table:${table}`;
            const rawData = await redisClient.get(key);
            const existing = rawData ? JSON.parse(rawData) : null;

            if (existing && existing.type === 'ORDER') {
                existing.orders.push(newOrder);
                existing.grandTotal += newOrder.total;
                await redisClient.set(key, JSON.stringify(existing));
                console.log(`[UPDATE] Table ${table} added new order. New Grand Total: ₹${existing.grandTotal}`);
            } else {
                const newEntry = {
                    type: 'ORDER',
                    orders: [newOrder],
                    grandTotal: newOrder.total
                };
                await redisClient.set(key, JSON.stringify(newEntry));
                console.log(`[NEW] Table ${table} started order. Total: ₹${newOrder.total}`);
            }
            
            return res.status(200).json({ success: true, message: "Order updated" });
        } catch (error) {
            console.error('POST Error:', error);
            return res.status(500).json({ error: 'Failed to create order' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
