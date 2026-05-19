/**
 * Bacchus Inn — Local Development Server
 * 
 * This file mirrors the Vercel serverless function behavior for local development.
 * In production (Vercel), each file in /api/ is its own serverless function.
 * Locally, this Express server routes to the same handler logic.
 * 
 * Routes:
 *   POST /api/session      — Create customer session
 *   GET  /api/orders       — Fetch all active orders (admin)
 *   POST /api/orders       — Place order (customer, session-validated)
 *   POST /api/waiter       — Call waiter (customer, session-validated, rate-limited)
 *   POST /api/resolve      — Resolve single table (admin)
 *   POST /api/resolve-all  — Resolve all tables (admin)
 */

// Load environment variables from .env.local for local development
// (Vercel automatically injects env vars in production)
require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import Vercel serverless handlers
const sessionHandler = require('./api/session');
const ordersHandler = require('./api/orders');
const waiterHandler = require('./api/waiter');
const resolveHandler = require('./api/resolve');
const resolveAllHandler = require('./api/resolve-all');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve HTML files locally

// --- Route adapters ---
// Vercel serverless functions receive (req, res) directly.
// Express routes work the same way, so we can forward directly.

// Session management
app.post('/api/session', sessionHandler);

// Orders
app.get('/api/orders', ordersHandler);
app.post('/api/orders', ordersHandler);

// Waiter
app.post('/api/waiter', waiterHandler);

// Admin: Resolve single table
app.post('/api/resolve', resolveHandler);

// Admin: Resolve all tables
app.post('/api/resolve-all', resolveAllHandler);

// Handle OPTIONS preflight for all /api routes (Express 5 named wildcard syntax)
app.options('/api/{*path}', (req, res) => res.status(200).end());

// Only listen if running locally (not on Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Bacchus Backend running at http://localhost:${PORT}`);
        console.log(`Customer menu: http://localhost:${PORT}/index.html?table=45`);
        console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
    });
}

module.exports = app;
