/**
 * Waiter Call Endpoint — POST /api/waiter
 * 
 * Customer-facing — requires valid session.
 * 
 * Additions:
 * - Session validation via validate-session.js
 * - Rate limiting: one waiter call per table per 60 seconds
 * - Proper error responses (403 expired, 429 rate limited)
 */
const { getRedisClient } = require('./redis-client');
const { validateSession, SESSION_TTL_SECONDS } = require('./validate-session');

// Rate limit: 60 seconds between waiter calls per table
const WAITER_COOLDOWN_SECONDS = 60;

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
        const { table, sessionToken } = req.body;

        if (!table) {
            return res.status(400).json({ error: 'Table number required' });
        }

        // --- Session validation ---
        const sessionResult = await validateSession(redisClient, sessionToken, table, req);
        if (!sessionResult.valid) {
            return res.status(sessionResult.statusCode).json({ error: sessionResult.error });
        }

        // Session is valid — refresh TTL on every successful action (inactivity-based)
        if (!sessionResult.renewed) {
            const sessionKey = `session:${sessionToken}`;
            await redisClient.expire(sessionKey, SESSION_TTL_SECONDS);
        }

        // --- Rate limiting: waiter:{table} with 60s TTL ---
        const rateLimitKey = `waiter:${table}`;
        const existingCall = await redisClient.get(rateLimitKey);

        if (existingCall) {
            const ttl = await redisClient.ttl(rateLimitKey);
            console.log(`[WAITER] Rate limited: Table ${table} (${ttl}s remaining)`);
            return res.status(429).json({
                error: 'Waiter has already been called recently. Please wait a moment.',
                retryAfterSeconds: ttl > 0 ? ttl : WAITER_COOLDOWN_SECONDS
            });
        }

        // Set rate limit key with 60s TTL
        await redisClient.set(rateLimitKey, '1', { EX: WAITER_COOLDOWN_SECONDS });

        // --- Create waiter notification for admin dashboard ---
        const key = `table:${table}`;
        const rawData = await redisClient.get(key);
        const existing = rawData ? JSON.parse(rawData) : null;

        // Only create a WAITER entry if there's no active ORDER for this table
        // (If there's already an order, admin already sees the table as active)
        if (!existing || existing.type !== 'ORDER') {
            await redisClient.set(key, JSON.stringify({
                type: 'WAITER',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
            }));
        }
        
        console.log(`[WAITER] Table ${table} calling`);
        return res.status(200).json({ success: true, message: 'Waiter notified' });
    } catch (error) {
        console.error('[WAITER] Error:', error);
        return res.status(500).json({ error: 'Failed to call waiter' });
    }
};
