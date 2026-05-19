/**
 * Orders Endpoint — GET & POST /api/orders
 * 
 * GET:  Fetch all active orders (used by admin dashboard — no session required)
 * POST: Create a new order (customer-facing — requires valid session)
 * 
 * POST additions:
 * - Session validation via validate-session.js
 * - Duplicate order protection via order:{orderId} Redis key (24h TTL)
 * - Proper error responses (403 for expired session, 409 for duplicate)
 */
const { getRedisClient } = require('./redis-client');
const { isValidTableNumber, isValidUUID, getZone, validateZone } = require('./table-config');
const { validateSession, SESSION_TTL_SECONDS } = require('./validate-session');

// Duplicate order protection TTL: 24 hours
const ORDER_DEDUP_TTL = 86400;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const redisClient = await getRedisClient();

    // =============================================
    // GET: Fetch all active orders (admin dashboard)
    // No session validation — admin doesn't need it
    // =============================================
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
            console.error('GET /api/orders Error:', error);
            return res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
        }
    }

    // =============================================
    // POST: Create new order (customer-facing)
    // Requires: { table, sessionToken, orderId, items, total }
    // =============================================
    if (req.method === 'POST') {
        try {
            const { table, sessionToken, orderId, items, total, zone } = req.body;
            
            // --- Basic input validation ---
            if (!table) {
                return res.status(400).json({ error: 'Table number required' });
            }

            if (!items || typeof items !== 'object' || Object.keys(items).length === 0) {
                return res.status(400).json({ error: 'Order items required' });
            }

            // --- Session validation ---
            const sessionResult = await validateSession(redisClient, sessionToken, table, req);
            if (!sessionResult.valid) {
                return res.status(sessionResult.statusCode).json({ error: sessionResult.error });
            }

            // Session is valid — refresh TTL on every successful order (inactivity-based)
            if (!sessionResult.renewed) {
                const sessionKey = `session:${sessionToken}`;
                await redisClient.expire(sessionKey, SESSION_TTL_SECONDS);
            }

            // --- Duplicate order protection ---
            if (orderId && isValidUUID(orderId)) {
                const orderKey = `order:${orderId}`;
                const existingOrder = await redisClient.get(orderKey);

                if (existingOrder) {
                    // Order already processed — return success without creating duplicate
                    console.log(`[ORDER] Duplicate order ${orderId} for table ${table} — ignoring`);
                    return res.status(200).json({ 
                        success: true, 
                        message: 'Order already received',
                        duplicate: true 
                    });
                }

                // Mark this orderId as processed (24h TTL)
                await redisClient.set(orderKey, '1', { EX: ORDER_DEDUP_TTL });
            }

            // --- Zone validation ---
            // Server recalculates zone from table number (never trust client alone)
            const serverZone = getZone(table);
            if (zone && !validateZone(table, zone)) {
                console.warn(`[ORDER] Zone mismatch: client sent "${zone}" but table ${table} is "${serverZone}"`);
            }

            // --- Create the order ---
            const newOrder = {
                items: items,
                total: total,
                zone: serverZone, // Store authoritative zone for audit
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
            };

            const key = `table:${table}`;
            const rawData = await redisClient.get(key);
            const existing = rawData ? JSON.parse(rawData) : null;

            if (existing && existing.type === 'ORDER') {
                // Append to existing table orders
                existing.orders.push(newOrder);
                existing.grandTotal += newOrder.total;
                await redisClient.set(key, JSON.stringify(existing));
                console.log(`[ORDER] Table ${table} added new order. Grand Total: ₹${existing.grandTotal}`);
            } else {
                // Create new table entry
                const newEntry = {
                    type: 'ORDER',
                    orders: [newOrder],
                    grandTotal: newOrder.total
                };
                await redisClient.set(key, JSON.stringify(newEntry));
                console.log(`[ORDER] Table ${table} started order. Total: ₹${newOrder.total}`);
            }
            
            return res.status(200).json({ success: true, message: 'Order received' });
        } catch (error) {
            console.error('POST /api/orders Error:', error);
            return res.status(500).json({ error: 'Failed to create order' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
