const jwt = require("jsonwebtoken");
const SosModel = require("../models/sosModel");
const { validateSosDto } = require("../utils/validators");
const env = require("../config/env");
const sampleAlerts = require("../data/sampleAlerts");

/**
 * POST /api/sos
 * Idempotent SOS upload endpoint. Upserts into MongoDB Atlas using existing SOS UUID.
 */
async function createSos(req, res) {
  const validationErrors = validateSosDto(req.body);
  if (validationErrors.length > 0) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: validationErrors,
    });
  }

  try {
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

    const result = await SosModel.upsert(sosDocument);

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
}

/**
 * GET /api/sos
 * Retrieve SOS messages with optional filtering and pagination
 */
async function getSosMessages(req, res) {
  try {
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

    const totalCount = await SosModel.count(filter);
    const messages = await SosModel.find({
      filter,
      sort: { createdAt: -1 },
      skip,
      limit,
    });

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
}

/**
 * GET /api/sos/stats
 * Aggregate metrics and statistics for dashboard overview
 */
async function getSosStats(req, res) {
  try {
    const stats = await SosModel.getStats();
    return res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[Backend] Error calculating stats:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error calculating SOS stats: " + error.message,
    });
  }
}

/**
 * GET /api/sos/:id
 * Retrieve a specific SOS message by ID
 */
async function getSosById(req, res) {
  try {
    const sos = await SosModel.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ success: false, error: "SOS message not found" });
    }
    return res.status(200).json({ success: true, data: sos });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PATCH /api/sos/:id/status
 * Update the delivery or response status of an SOS message
 */
async function updateSosStatus(req, res) {
  try {
    const { status, responderNotes } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: "Status field is required" });
    }

    const result = await SosModel.updateStatus(req.params.id, {
      deliveryStatus: status,
      responderNotes,
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "SOS message not found" });
    }

    const updated = await SosModel.findById(req.params.id);
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/sos/:id/volunteer
 * Toggle volunteering for an SOS alert & update volunteer count
 */
async function toggleVolunteer(req, res) {
  try {
    const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
    let username = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        username = decoded.username;
      } catch {}
    }
    if (!username && req.body && req.body.username) {
      username = req.body.username.trim().toLowerCase();
    }
    if (!username) {
      return res.status(401).json({ success: false, error: "Please log in to volunteer for this SOS alert" });
    }

    const sos = await SosModel.findById(req.params.id);
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

    await SosModel.updateVolunteers(req.params.id, {
      volunteers: updatedVolunteers,
      volunteerCount: newVolunteerCount,
      deliveryStatus: newStatus,
    });

    const updated = await SosModel.findById(req.params.id);

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
}

/**
 * POST /api/sos/seed
 * Seed realistic disaster SOS sample documents if database is empty or for demo testing
 */
async function seedSos(req, res) {
  try {
    const count = await SosModel.seed(sampleAlerts);
    return res.status(200).json({
      success: true,
      message: `Successfully seeded ${sampleAlerts.length} realistic SOS alerts`,
      count: sampleAlerts.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  createSos,
  getSosMessages,
  getSosStats,
  getSosById,
  updateSosStatus,
  toggleVolunteer,
  seedSos,
};
