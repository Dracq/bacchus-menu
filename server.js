// c:\Users\shubh\Desktop\bacchus\bacchus\bacchus-menu\server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve HTML files locally

let activeOrders = {};

// 1. Receive New Order (Adds to a list for the table)
app.post('/api/orders', (req, res) => {
    const data = req.body;
    const table = data.table;
    
    if (!table) return res.status(400).json({ error: "Table number required" });

    const newOrder = {
        items: data.items,
        total: data.total,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    // If table already has an order, add the new order to its list
    if (activeOrders[table] && activeOrders[table].type === 'ORDER') {
        activeOrders[table].orders.push(newOrder);
        activeOrders[table].grandTotal += newOrder.total;
        console.log(`[UPDATE] Table ${table} added new order. New Grand Total: ₹${activeOrders[table].grandTotal}`);
    } else {
        // Otherwise, create a new entry for the table
        activeOrders[table] = {
            type: 'ORDER',
            orders: [newOrder], // Start with a list containing the first order
            grandTotal: newOrder.total
        };
        console.log(`[NEW] Table ${table} started order. Total: ₹${newOrder.total}`);
    }
    
    res.json({ success: true, message: "Order updated" });
});

// 2. Receive Waiter Call
app.post('/api/waiter', (req, res) => {
    const data = req.body;
    const table = data.table;

    if (!table) return res.status(400).json({ error: "Table number required" });

    if (!activeOrders[table] || activeOrders[table].type !== 'ORDER') {
        activeOrders[table] = {
            type: 'WAITER',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
        };
    }
    
    console.log(`[WAITER] Table ${table} calling`);
    res.json({ success: true, message: "Waiter notified" });
});

// 3. Get All Active Orders
app.get('/api/orders', (req, res) => {
    res.json(activeOrders);
});

// 4. Mark Table as Done (Reset)
app.post('/api/orders/:table/resolve', (req, res) => {
    const table = req.params.table;
    if (activeOrders[table]) {
        delete activeOrders[table];
        console.log(`[RESOLVED] Table ${table} cleared`);
    }
    res.json({ success: true });
});

// Only listen if running locally (not on Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Bacchus Backend running at http://localhost:${PORT}`);
    });
}

module.exports = app;
