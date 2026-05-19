/**
 * Table Configuration — Single Source of Truth
 * 
 * All valid table ranges and zone definitions for Bacchus Inn.
 * Used by session creation, order validation, waiter requests,
 * zone pricing, and the customer frontend.
 * 
 * Zones:
 *   Garden tables: 30-62, 76-110
 *   Hut tables:    63-75, 111-120
 * 
 * Architecture supports adding new zones (e.g. "vip", "rooftop")
 * by simply adding entries to ZONE_TABLE_RANGES.
 */

// --- Zone definitions ---
const ZONE_TABLE_RANGES = {
    hut: [
        [63, 75],
        [111, 120]
    ]
};

// Maximum table number in the system (for admin dashboard)
const MAX_TABLE_NUMBER = 120;

// Flat list of all specific table ranges
const ALL_TABLE_RANGES = Object.values(ZONE_TABLE_RANGES).flat();

/**
 * Determine the seating zone for a table number.
 * @param {number|string} tableNumber
 * @returns {"garden"|"hut"|null} — null if table doesn't belong to any zone
 */
function getZone(tableNumber) {
    const n = Number(tableNumber);
    if (!Number.isInteger(n) || n <= 0) return null; // Must be positive integer

    if (ZONE_TABLE_RANGES.hut.some(([start, end]) => n >= start && n <= end)) {
        return 'hut';
    }
    return 'garden'; // Default all other positive table numbers to garden
}

/**
 * Check if a table number is valid (belongs to any zone).
 * @param {number|string} num - Table number to validate
 * @returns {boolean}
 */
function isValidTableNumber(num) {
    return getZone(num) !== null;
}

/**
 * Validate that a client-provided zone matches the expected zone for a table.
 * Never trust the client-provided zone alone — always recalculate.
 * @param {number|string} tableNumber
 * @param {string} claimedZone - Zone claimed by the client
 * @returns {boolean}
 */
function validateZone(tableNumber, claimedZone) {
    const actualZone = getZone(tableNumber);
    return actualZone !== null && actualZone === claimedZone;
}

/**
 * Validate UUID v4 format.
 * @param {string} uuid - String to validate
 * @returns {boolean}
 */
function isValidUUID(uuid) {
    if (typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

module.exports = {
    ZONE_TABLE_RANGES,
    ALL_TABLE_RANGES,
    MAX_TABLE_NUMBER,
    getZone,
    isValidTableNumber,
    validateZone,
    isValidUUID
};
