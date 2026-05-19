/**
 * Shared Redis Client Factory
 * 
 * Centralizes Redis connection management across all Vercel serverless functions.
 * Uses a singleton pattern so the connection is reused across warm starts.
 * Each cold start creates a new connection.
 * 
 * Includes retry configuration to prevent infinite reconnection loops.
 */
const { createClient } = require('redis');

let client = null;
let connectionFailed = false;

async function getRedisClient() {
    if (connectionFailed) {
        throw new Error('Redis connection previously failed. Restart server to retry.');
    }

    if (!client) {
        client = createClient({
            url: process.env.KV_URL || process.env.REDIS_URL,
            socket: {
                // Limit reconnection attempts to avoid infinite loops
                reconnectStrategy: (retries) => {
                    if (retries > 5) {
                        connectionFailed = true;
                        console.error('[REDIS] Max reconnection attempts reached. Giving up.');
                        return new Error('Max reconnection attempts reached');
                    }
                    // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
                    return Math.min(retries * 100, 3000);
                },
                connectTimeout: 10000 // 10 second connection timeout
            }
        });
        client.on('error', err => console.error('Redis Client Error', err.message));
        
        try {
            await client.connect();
            console.log('[REDIS] Connected successfully');
        } catch (err) {
            client = null;
            connectionFailed = true;
            throw new Error(`Redis connection failed: ${err.message}`);
        }
    }
    return client;
}

module.exports = { getRedisClient };
