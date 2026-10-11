const express = require("express");
const { MongoClient } = require("mongodb");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const cors = require("cors");
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "crisos_jwt_super_secret_key_2026";

// Enable CORS with credentials for cookies across origins
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "crisos";
const MONGODB_COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME || "sos_messages";

let mongoClient = null;
let sosCollection = null;
let usersCollection = null;

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
 * Connect to MongoDB Atlas and ensure unique index on users table
 */
async function getUsersCollection() {
  if (usersCollection) return usersCollection;
  if (!mongoClient) {
    await getCollection();
  }
  const db = mongoClient.db(MONGODB_DB_NAME);
  usersCollection = db.collection("users");
  await usersCollection.createIndex({ username: 1 }, { unique: true });
  return usersCollection;
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

/* ==========================================================================
   AUTHENTICATION ENDPOINTS (JWT & HTTP-ONLY COOKIES)
   ========================================================================== */

/**
 * POST /api/auth/signup
 * Register a new user with hashed password
 */
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ success: false, error: "Username must be at least 3 characters long" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = await getUsersCollection();
    const existing = await users.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(409).json({ success: false, error: "Username is already taken" });
    }

    // Store password as secure bcrypt hash
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await users.insertOne({
      username: cleanUsername,
      passwordHash,
      createdAt: Date.now(),
    });

    // Create JWT token
    const token = jwt.sign(
      { id: result.insertedId.toString(), username: cleanUsername },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Set secure cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: "Account registered successfully",
      token,
      user: { username: cleanUsername },
    });
  } catch (error) {
    console.error("[Auth] Signup error:", error.message);
    return res.status(500).json({ success: false, error: "Signup error: " + error.message });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user with hashed password verification & set JWT cookie
 */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = await getUsersCollection();
    const user = await users.findOne({ username: cleanUsername });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: user._id.toString(), username: cleanUsername },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
      token,
      user: { username: cleanUsername },
    });
  } catch (error) {
    console.error("[Auth] Login error:", error.message);
    return res.status(500).json({ success: false, error: "Login error: " + error.message });
  }
});

/**
 * POST /api/auth/logout
 * Clear JWT authentication cookie
 */
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  return res.status(200).json({ success: true, message: "Logged out successfully" });
});

/**
 * GET /api/auth/me
 * Check currently authenticated user session from cookie or Bearer token
 */
app.get("/api/auth/me", (req, res) => {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
  if (!token) {
    return res.status(200).json({ success: true, user: null });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({ success: true, user: { username: decoded.username } });
  } catch {
    return res.status(200).json({ success: true, user: null });
  }
});

/**
 * POST /api/sos/:id/volunteer
 * Toggle volunteering for an SOS alert & update volunteer count
 */
app.post("/api/sos/:id/volunteer", async (req, res) => {
  try {
    const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
    let username = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        username = decoded.username;
      } catch {}
    }
    if (!username && req.body && req.body.username) {
      username = req.body.username.trim().toLowerCase();
    }
    if (!username) {
      return res.status(401).json({ success: false, error: "Please log in to volunteer for this SOS alert" });
    }

    const collection = await getCollection();
    const sos = await collection.findOne({ id: req.params.id });
    if (!sos) {
      return res.status(404).json({ success: false, error: "SOS message not found" });
    }

    const currentVolunteers = Array.isArray(sos.volunteers) ? sos.volunteers : [];
    const alreadyVolunteered = currentVolunteers.includes(username);

    let updatedVolunteers;
    if (alreadyVolunteered) {
      // Toggle off
      updatedVolunteers = currentVolunteers.filter((u) => u !== username);
    } else {
      // Add volunteer
      updatedVolunteers = [...currentVolunteers, username];
    }

    const newVolunteerCount = updatedVolunteers.length;
    let newStatus = sos.deliveryStatus;
    if (!alreadyVolunteered && sos.deliveryStatus === "QUEUED") {
      newStatus = "IN_PROGRESS";
    }

    await collection.updateOne(
      { id: req.params.id },
      {
        $set: {
          volunteers: updatedVolunteers,
          volunteerCount: newVolunteerCount,
          deliveryStatus: newStatus,
          lastUpdatedAt: Date.now(),
        },
      }
    );

    const updated = await collection.findOne({ id: req.params.id });

    return res.status(200).json({
      success: true,
      volunteered: !alreadyVolunteered,
      volunteerCount: newVolunteerCount,
      data: updated,
    });
  } catch (error) {
    console.error("[Volunteer] Error:", error.message);
    return res.status(500).json({ success: false, error: "Error updating volunteer status: " + error.message });
  }
});

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
