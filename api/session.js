/**
 * Session Creation Endpoint — POST /api/session
 * 
 * Called automatically when a customer opens index.html?table=X.
 * Creates a Redis-backed session with 90-minute inactivity TTL.
 * 
 * Request:  { table: 45, sessionToken: "uuid" }
 * Response: { success: true, createdAt: "..." }
 * 
 * The frontend generates the sessionToken using crypto.randomUUID()
 * and stores it in localStorage. This endpoint just persists it in Redis.
 */
const { getRedisClient } = require('./redis-client');
const { isValidTableNumber, isValidUUID } = require('./table-config');
const { SESSION_TTL_SECONDS, generateFingerprint } = require('./validate-session');

module.exports = async (req, res) => {
    // --- CORS headers ---
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
        const { table, sessionToken } = req.body;

        // --- Validate table number ---
        const tableNum = Number(table);
        if (!isValidTableNumber(tableNum)) {
            return res.status(400).json({
                error: `Invalid table number. Please scan a valid table QR code.`
            });
        }

        // --- Validate session token format ---
        if (!sessionToken || !isValidUUID(sessionToken)) {
            return res.status(400).json({
                error: 'Invalid session token format.'
            });
        }

        const redisClient = await getRedisClient();
        const sessionKey = `session:${sessionToken}`;

        // --- Check if session already exists (idempotent) ---
        const existing = await redisClient.get(sessionKey);
        if (existing) {
            const parsed = JSON.parse(existing);
            // If same table, just refresh TTL and return success
            if (Number(parsed.table) === tableNum) {
                await redisClient.expire(sessionKey, SESSION_TTL_SECONDS);
                console.log(`[SESSION] Refreshed existing session for table ${tableNum}`);
                return res.status(200).json({
                    success: true,
                    createdAt: parsed.createdAt
                });
            }
            // Different table with same token — reject (shouldn't happen with crypto.randomUUID)
            return res.status(409).json({
                error: 'Session token already in use for a different table.'
            });
        }

        // --- Create new session ---
        const now = new Date().toISOString();
        const fingerprint = generateFingerprint(req);

        const sessionData = {
            table: tableNum,
            createdAt: now,
            fingerprint: fingerprint
        };

        // Store in Redis with 90-minute TTL (inactivity-based expiry)
        await redisClient.set(sessionKey, JSON.stringify(sessionData), {
            EX: SESSION_TTL_SECONDS
        });

        console.log(`[SESSION] Created session for table ${tableNum} | token: ${sessionToken.substring(0, 8)}...`);

        return res.status(201).json({
            success: true,
            createdAt: now
        });

    } catch (error) {
        console.error('[SESSION] Error:', error);
        return res.status(500).json({ error: 'Failed to create session' });
    }
};
