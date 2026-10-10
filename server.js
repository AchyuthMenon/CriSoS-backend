const express = require("express");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const cors = require("cors");
const app = express();
app.use(cors());
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
 * GET /api/sos
 * Retrieve SOS messages with optional filtering and pagination
 */
app.get("/api/sos", async (req, res) => {
  try {
    const collection = await getCollection();
    const { category, status, search, limit = 50, skip = 0 } = req.query;

    const filter = {};
    if (category && category !== "ALL") {
      filter.emergencyCategory = category.toUpperCase();
    }
    if (status && status !== "ALL") {
      filter.deliveryStatus = status.toUpperCase();
    }
    if (search) {
      filter.$or = [
        { id: { $regex: search, $options: "i" } },
        { senderDeviceId: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { emergencyCategory: { $regex: search, $options: "i" } },
        { assistanceTypes: { $regex: search, $options: "i" } },
      ];
    }

    const totalCount = await collection.countDocuments(filter);
    const messages = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .toArray();

    return res.status(200).json({
      success: true,
      count: messages.length,
      total: totalCount,
      data: messages,
    });
  } catch (error) {
    console.error("[Backend] Error querying SOS messages:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error querying SOS messages from database: " + error.message,
    });
  }
});

/**
 * GET /api/sos/stats
 * Aggregate metrics and statistics for dashboard overview
 */
app.get("/api/sos/stats", async (req, res) => {
  try {
    const collection = await getCollection();
    const total = await collection.countDocuments();
    const categoryCounts = await collection
      .aggregate([
        { $group: { _id: "$emergencyCategory", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    const statusCounts = await collection
      .aggregate([
        { $group: { _id: "$deliveryStatus", count: { $sum: 1 } } },
      ])
      .toArray();

    const activeCount = await collection.countDocuments({
      deliveryStatus: { $in: ["QUEUED", "DELIVERED", "IN_PROGRESS", "ACTIVE"] },
    });

    const resolvedCount = await collection.countDocuments({
      deliveryStatus: "RESOLVED",
    });

    const latest = await collection.find().sort({ createdAt: -1 }).limit(1).toArray();

    return res.status(200).json({
      success: true,
      stats: {
        total,
        active: activeCount,
        resolved: resolvedCount,
        categories: categoryCounts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
        statuses: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        latestIncidentTime: latest.length ? latest[0].createdAt : null,
      },
    });
  } catch (error) {
    console.error("[Backend] Error calculating stats:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error calculating SOS stats: " + error.message,
    });
  }
});

/**
 * GET /api/sos/:id
 * Retrieve a specific SOS message by ID
 */
app.get("/api/sos/:id", async (req, res) => {
  try {
    const collection = await getCollection();
    const sos = await collection.findOne({ id: req.params.id });
    if (!sos) {
      return res.status(404).json({ success: false, error: "SOS message not found" });
    }
    return res.status(200).json({ success: true, data: sos });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/sos/:id/status
 * Update the delivery or response status of an SOS message
 */
app.patch("/api/sos/:id/status", async (req, res) => {
  try {
    const { status, responderNotes } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: "Status field is required" });
    }

    const collection = await getCollection();
    const updateDoc = {
      $set: {
        deliveryStatus: status.toUpperCase(),
        lastUpdatedAt: Date.now(),
      },
    };
    if (responderNotes !== undefined) {
      updateDoc.$set.responderNotes = responderNotes;
    }

    const result = await collection.updateOne({ id: req.params.id }, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "SOS message not found" });
    }

    const updated = await collection.findOne({ id: req.params.id });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sos/seed
 * Seed realistic disaster SOS sample documents if database is empty or for demo testing
 */
app.post("/api/sos/seed", async (req, res) => {
  try {
    const collection = await getCollection();
    const sampleAlerts = [
      {
        id: "sos-2026-med-0914",
        messageType: "SOS",
        senderDeviceId: "dev-mesh-relay-alpha",
        emergencyCategory: "MEDICAL",
        description: "Elderly resident trapped on 2nd floor with cardiac emergency and severe shortness of breath. Power cut, oxygen tank depleting.",
        assistanceTypes: ["FIRST_AID", "OXYGEN_SUPPORT", "EVACUATION"],
        latitude: 13.0827,
        longitude: 80.2707,
        locationAccuracyMeters: 4.2,
        locationTimestamp: Date.now() - 1000 * 60 * 18,
        createdAt: Date.now() - 1000 * 60 * 20,
        expiresAt: Date.now() + 86400000,
        hopCount: 2,
        maxHopCount: 5,
        deliveryStatus: "QUEUED",
        direction: "OUTGOING",
        incidentId: "INC-CHN-2026-081",
        serverReceivedAt: Date.now() - 1000 * 60 * 18,
      },
      {
        id: "sos-2026-fld-1042",
        messageType: "SOS",
        senderDeviceId: "dev-lora-node-049",
        emergencyCategory: "FLOOD",
        description: "Water level rose 1.8m in low-lying residential block. Family of 4 stranded on roof terrace with no drinking water.",
        assistanceTypes: ["BOAT_RESCUE", "DRINKING_WATER", "FOOD_RATIONS"],
        latitude: 13.0359,
        longitude: 80.2158,
        locationAccuracyMeters: 6.8,
        locationTimestamp: Date.now() - 1000 * 60 * 45,
        createdAt: Date.now() - 1000 * 60 * 50,
        expiresAt: Date.now() + 86400000,
        hopCount: 3,
        maxHopCount: 5,
        deliveryStatus: "IN_PROGRESS",
        direction: "OUTGOING",
        incidentId: "INC-CHN-2026-079",
        serverReceivedAt: Date.now() - 1000 * 60 * 42,
      },
      {
        id: "sos-2026-fir-0319",
        messageType: "SOS",
        senderDeviceId: "dev-ble-gateway-11",
        emergencyCategory: "FIRE",
        description: "Transformer explosion caused blaze spreading rapidly across timber storage yard. Thick smoke engulfing adjacent clinic.",
        assistanceTypes: ["FIRE_EXTINGUISH", "SMOKE_MASKS", "EVACUATION"],
        latitude: 12.9716,
        longitude: 77.5946,
        locationAccuracyMeters: 3.1,
        locationTimestamp: Date.now() - 1000 * 60 * 95,
        createdAt: Date.now() - 1000 * 60 * 100,
        expiresAt: Date.now() + 86400000,
        hopCount: 1,
        maxHopCount: 5,
        deliveryStatus: "DELIVERED",
        direction: "OUTGOING",
        incidentId: "INC-BLR-2026-012",
        serverReceivedAt: Date.now() - 1000 * 60 * 95,
      },
      {
        id: "sos-2026-res-7721",
        messageType: "SOS",
        senderDeviceId: "dev-phone-mesh-882",
        emergencyCategory: "SEARCH_RESCUE",
        description: "Two hikers lost off-trail following flash landslide. Cell towers down. One person has fractured ankle.",
        assistanceTypes: ["STRETCHER", "FIRST_AID", "SEARCH_TEAM"],
        latitude: 11.4102,
        longitude: 76.6950,
        locationAccuracyMeters: 8.5,
        locationTimestamp: Date.now() - 1000 * 60 * 180,
        createdAt: Date.now() - 1000 * 60 * 190,
        expiresAt: Date.now() + 86400000,
        hopCount: 4,
        maxHopCount: 5,
        deliveryStatus: "QUEUED",
        direction: "OUTGOING",
        incidentId: "INC-OOT-2026-004",
        serverReceivedAt: Date.now() - 1000 * 60 * 180,
      },
      {
        id: "sos-2026-eqk-5012",
        messageType: "SOS",
        senderDeviceId: "dev-lora-relay-02",
        emergencyCategory: "EARTHQUAKE",
        description: "Structural collapse of old community center wing. 3 persons accounted for, 2 suspected under rubble. Voice taps heard.",
        assistanceTypes: ["HEAVY_LIFT", "ACOUSTIC_LOCATOR", "PARAMEDIC"],
        latitude: 15.3173,
        longitude: 75.7139,
        locationAccuracyMeters: 5.0,
        locationTimestamp: Date.now() - 1000 * 60 * 300,
        createdAt: Date.now() - 1000 * 60 * 310,
        expiresAt: Date.now() + 86400000,
        hopCount: 2,
        maxHopCount: 5,
        deliveryStatus: "RESOLVED",
        direction: "OUTGOING",
        incidentId: "INC-KA-2026-041",
        serverReceivedAt: Date.now() - 1000 * 60 * 300,
        responderNotes: "All 5 persons retrieved successfully by NDRF unit. Shifted to civil hospital.",
      },
      {
        id: "sos-2026-fod-3389",
        messageType: "SOS",
        senderDeviceId: "dev-mesh-relay-beta",
        emergencyCategory: "FOOD_WATER",
        description: "Isolated shelter housing 35 displaced flood victims running out of baby formula and potable water. Bridge road severed.",
        assistanceTypes: ["DRINKING_WATER", "INFANT_FOOD", "HYGIENE_KITS"],
        latitude: 13.1235,
        longitude: 80.1982,
        locationAccuracyMeters: 10.0,
        locationTimestamp: Date.now() - 1000 * 60 * 420,
        createdAt: Date.now() - 1000 * 60 * 430,
        expiresAt: Date.now() + 86400000,
        hopCount: 3,
        maxHopCount: 5,
        deliveryStatus: "DELIVERED",
        direction: "OUTGOING",
        incidentId: "INC-CHN-2026-065",
        serverReceivedAt: Date.now() - 1000 * 60 * 420,
      }
    ];

    let inserted = 0;
    for (const doc of sampleAlerts) {
      const resUpsert = await collection.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
      if (resUpsert.upsertedCount > 0 || resUpsert.modifiedCount > 0) inserted++;
    }

    return res.status(200).json({
      success: true,
      message: `Successfully seeded ${sampleAlerts.length} realistic SOS alerts`,
      count: sampleAlerts.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

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
