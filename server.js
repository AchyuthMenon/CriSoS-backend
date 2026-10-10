const express = require("express");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "crisos";
const MONGODB_COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME || "sos_messages";

let mongoClient = null;
let sosCollection = null;

/**
 * Connect to MongoDB Atlas and ensure unique index on the SOS UUID
 */
async function getCollection() {
  if (sosCollection) return sosCollection;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not configured");
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    console.log("[MongoDB] Connected to MongoDB Atlas");
  }

  const db = mongoClient.db(MONGODB_DB_NAME);
  sosCollection = db.collection(MONGODB_COLLECTION_NAME);

  // Ensure unique index on SOS id for idempotency
  await sosCollection.createIndex({ id: 1 }, { unique: true });
  return sosCollection;
}

/**
 * Validate incoming SOS DTO
 */
function validateSosDto(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object"];
  }
  if (!body.id || typeof body.id !== "string" || body.id.trim() === "") {
    errors.push("Field 'id' is required and must be a non-empty string");
  }
  if (!body.senderDeviceId || typeof body.senderDeviceId !== "string") {
    errors.push("Field 'senderDeviceId' is required and must be a string");
  }
  if (!body.emergencyCategory || typeof body.emergencyCategory !== "string") {
    errors.push("Field 'emergencyCategory' is required and must be a string");
  }
  if (typeof body.createdAt !== "number" || body.createdAt <= 0) {
    errors.push("Field 'createdAt' is required and must be a valid epoch millisecond timestamp");
  }
  return errors;
}

/**
 * POST /api/sos
 * Idempotent SOS upload endpoint. Upserts into MongoDB Atlas using existing SOS UUID.
 */
app.post("/api/sos", async (req, res) => {
  const validationErrors = validateSosDto(req.body);
  if (validationErrors.length > 0) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: validationErrors,
    });
  }

  try {
    const collection = await getCollection();

    const sosDocument = {
      id: req.body.id.trim(),
      messageType: req.body.messageType || "SOS",
      senderDeviceId: req.body.senderDeviceId,
      emergencyCategory: req.body.emergencyCategory,
      description: req.body.description || "",
      assistanceTypes: Array.isArray(req.body.assistanceTypes) ? req.body.assistanceTypes : [],
      latitude: typeof req.body.latitude === "number" ? req.body.latitude : null,
      longitude: typeof req.body.longitude === "number" ? req.body.longitude : null,
      locationAccuracyMeters: typeof req.body.locationAccuracyMeters === "number" ? req.body.locationAccuracyMeters : null,
      locationTimestamp: typeof req.body.locationTimestamp === "number" ? req.body.locationTimestamp : null,
      createdAt: req.body.createdAt,
      expiresAt: typeof req.body.expiresAt === "number" ? req.body.expiresAt : req.body.createdAt + 86400000,
      hopCount: typeof req.body.hopCount === "number" ? req.body.hopCount : 0,
      maxHopCount: typeof req.body.maxHopCount === "number" ? req.body.maxHopCount : 5,
      deliveryStatus: req.body.deliveryStatus || "QUEUED",
      direction: req.body.direction || "OUTGOING",
      incidentId: req.body.incidentId || null,
      serverReceivedAt: Date.now(),
    };

    // Idempotent upsert by SOS id
    const filter = { id: sosDocument.id };
    const update = { $set: sosDocument };
    const options = { upsert: true };

    const result = await collection.updateOne(filter, update, options);

    return res.status(200).json({
      success: true,
      id: sosDocument.id,
      acknowledged: result.acknowledged,
      upserted: Boolean(result.upsertedCount > 0),
      timestamp: Date.now(),
    });
  } catch (error) {
    if (error.message && error.message.includes("MONGODB_URI")) {
      console.warn("[Backend] Upload requested but MONGODB_URI is not set in .env");
      return res.status(503).json({
        success: false,
        error: "MongoDB Atlas is not configured on this server. Please supply MONGODB_URI in .env.",
      });
    }

    console.error("[Backend] Error storing SOS in MongoDB Atlas:", error.message);
    return res.status(500).json({
      success: false,
      error: "Internal server error during database persistence",
    });
  }
});

/**
 * Health check endpoint
 */
app.get("/api/health", async (req, res) => {
  let dbStatus = "unconnected";
  if (MONGODB_URI) {
    try {
      await getCollection();
      dbStatus = "connected";
    } catch (e) {
      dbStatus = `error: ${e.message}`;
    }
  } else {
    dbStatus = "missing_MONGODB_URI";
  }

  res.json({
    status: "ok",
    service: "CriSOS MongoDB Atlas Backend",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[CriSOS Backend] Listening on port ${PORT}`);
    if (!MONGODB_URI) {
      console.log("[CriSOS Backend] NOTE: MONGODB_URI is not set in .env. Configure it before uploading live SOS alerts.");
    }
  });
}

module.exports = { app, validateSosDto, getCollection };
