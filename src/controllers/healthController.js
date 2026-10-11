const { getSosCollection } = require("../config/db");
const env = require("../config/env");

/**
 * GET /api/health
 * Health check endpoint
 */
async function getHealth(req, res) {
  let dbStatus = "unconnected";
  if (env.MONGODB_URI) {
    try {
      await getSosCollection();
      dbStatus = "connected";
    } catch (e) {
      dbStatus = `error: ${e.message}`;
    }
  } else {
    dbStatus = "missing_MONGODB_URI";
  }

  return res.json({
    status: "ok",
    service: "CriSOS MongoDB Atlas Backend",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getHealth,
};
