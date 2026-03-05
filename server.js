// c:\Users\shubh\Desktop\bacchus\bacchus\bacchus-menu\server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { kv } = require('@vercel/kv');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve HTML files locally

// 1. Receive New Order (Adds to a list for the table)
app.post('/api/orders', async (req, res) => {
    const data = req.body;
    const table = data.table;
    
    if (!table) return res.status(400).json({ error: "Table number required" });

    const newOrder = {
        items: data.items,
        total: data.total,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    const key = `table:${table}`;
    const existing = await kv.get(key);

    // If table already has an order, add the new order to its list
    if (existing && existing.type === 'ORDER') {
        existing.orders.push(newOrder);
        existing.grandTotal += newOrder.total;
        await kv.set(key, existing);
        console.log(`[UPDATE] Table ${table} added new order. New Grand Total: ₹${existing.grandTotal}`);
    } else {
        // Otherwise, create a new entry for the table
        const newEntry = {
            type: 'ORDER',
            orders: [newOrder], // Start with a list containing the first order
            grandTotal: newOrder.total
        };
        await kv.set(key, newEntry);
        console.log(`[NEW] Table ${table} started order. Total: ₹${newOrder.total}`);
    }
    
    res.json({ success: true, message: "Order updated" });
});

// 2. Receive Waiter Call
app.post('/api/waiter', async (req, res) => {
    const data = req.body;
    const table = data.table;

    if (!table) return res.status(400).json({ error: "Table number required" });

    const key = `table:${table}`;
    const existing = await kv.get(key);

    if (!existing || existing.type !== 'ORDER') {
        await kv.set(key, {
            type: 'WAITER',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
        };
    }
    
    console.log(`[WAITER] Table ${table} calling`);
    res.json({ success: true, message: "Waiter notified" });
});

// 3. Get All Active Orders
app.get('/api/orders', async (req, res) => {
    const keys = [];
    for await (const key of kv.scanIterator({ match: 'table:*' })) {
        keys.push(key);
    }

    if (keys.length === 0) return res.json({});

    const values = await kv.mget(...keys);
    const result = {};
    
    keys.forEach((key, index) => {
        const tableNum = key.split(':')[1];
        result[tableNum] = values[index];
    });

    res.json(result);
});

// 4. Mark Table as Done (Reset)
app.post('/api/orders/:table/resolve', async (req, res) => {
    const table = req.params.table;
    await kv.del(`table:${table}`);
    console.log(`[RESOLVED] Table ${table} cleared`);
    res.json({ success: true });
});

// Only listen if running locally (not on Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Bacchus Backend running at http://localhost:${PORT}`);
    });
}

module.exports = app;
