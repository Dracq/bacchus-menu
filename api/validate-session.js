/**
 * Session Validation Helper
 * 
 * Shared validation logic used by orders.js and waiter.js.
 * 
 * Flow:
 * 1. Fetch session:{token} from Redis
 * 2. Verify session exists
 * 3. Verify stored table matches request table
 * 4. Check hard max lifetime (4 hours from creation)
 * 5. Auto-renew TTL if < 15 minutes remaining (inactivity-based expiry)
 * 6. Return validation result
 */
const { isValidTableNumber, isValidUUID } = require('./table-config');
const crypto = require('crypto');

// Session constants
const SESSION_TTL_SECONDS = 5400;          // 90 minutes inactivity timeout
const SESSION_RENEW_THRESHOLD = 900;       // 15 minutes — renew if TTL is below this
const SESSION_MAX_LIFETIME_MS = 4 * 60 * 60 * 1000; // 4 hours absolute max

/**
 * Generate a lightweight device fingerprint from request headers.
 * Not cryptographically strong — just prevents casual token sharing.
 * @param {object} req - HTTP request
 * @returns {string} - hex hash
 */
function generateFingerprint(req) {
    const ua = req.headers['user-agent'] || '';
    const lang = req.headers['accept-language'] || '';
    const raw = `${ua}|${lang}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Validate a customer session against Redis.
 * 
 * @param {object} redisClient - Connected Redis client
 * @param {string} sessionToken - UUID session token from client
 * @param {number|string} table - Table number from client
 * @param {object} req - HTTP request (for fingerprint validation)
 * @returns {object} - { valid, error, statusCode, renewed }
 */
async function validateSession(redisClient, sessionToken, table, req) {
    // --- Input validation ---
    if (!sessionToken || !isValidUUID(sessionToken)) {
        return { valid: false, error: 'Invalid session token format.', statusCode: 403 };
    }

    const tableNum = Number(table);
    if (!isValidTableNumber(tableNum)) {
        return { valid: false, error: 'Invalid table number.', statusCode: 400 };
    }

    // --- Fetch session from Redis ---
    const sessionKey = `session:${sessionToken}`;
    const rawSession = await redisClient.get(sessionKey);

    if (!rawSession) {
        return {
            valid: false,
            error: 'Session expired. Please rescan the table QR code.',
            statusCode: 403
        };
    }

    const session = JSON.parse(rawSession);

    // --- Verify table number matches ---
    if (Number(session.table) !== tableNum) {
        return {
            valid: false,
            error: 'Session does not match this table. Please rescan the QR code.',
            statusCode: 403
        };
    }

    // --- Check hard max lifetime (4 hours) ---
    const createdAt = new Date(session.createdAt).getTime();
    if (Date.now() - createdAt > SESSION_MAX_LIFETIME_MS) {
        // Session has exceeded absolute max lifetime — delete it
        await redisClient.del(sessionKey);
        return {
            valid: false,
            error: 'Session expired (maximum duration reached). Please rescan the table QR code.',
            statusCode: 403
        };
    }

    // --- Lightweight fingerprint validation ---
    if (session.fingerprint && req) {
        const currentFingerprint = generateFingerprint(req);
        if (session.fingerprint !== currentFingerprint) {
            console.warn(`[SESSION] Fingerprint mismatch for session ${sessionToken} on table ${tableNum}`);
            return {
                valid: false,
                error: 'Session invalid. Please rescan the table QR code.',
                statusCode: 403
            };
        }
    }

    // --- Auto-renew TTL if running low (inactivity-based refresh) ---
    let renewed = false;
    const ttl = await redisClient.ttl(sessionKey);
    if (ttl >= 0 && ttl < SESSION_RENEW_THRESHOLD) {
        await redisClient.expire(sessionKey, SESSION_TTL_SECONDS);
        renewed = true;
        console.log(`[SESSION] Renewed TTL for session ${sessionToken} on table ${tableNum}`);
    }

    return { valid: true, renewed };
}

module.exports = {
    validateSession,
    generateFingerprint,
    SESSION_TTL_SECONDS,
    SESSION_RENEW_THRESHOLD,
    SESSION_MAX_LIFETIME_MS
};
