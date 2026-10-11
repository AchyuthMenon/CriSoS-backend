const { getSosCollection } = require("../config/db");

class SosModel {
  /**
   * Access the underlying SOS MongoDB collection
   */
  static async getCollection() {
    return await getSosCollection();
  }

  /**
   * Idempotently upsert an SOS alert by UUID
   * @param {object} sosDocument
   * @returns {Promise<object>} Update result
   */
  static async upsert(sosDocument) {
    const collection = await getSosCollection();
    const filter = { id: sosDocument.id };
    const update = { $set: sosDocument };
    const options = { upsert: true };
    return collection.updateOne(filter, update, options);
  }

  /**
   * Find SOS messages matching query criteria
   * @param {object} options
   * @returns {Promise<Array>} List of SOS documents
   */
  static async find({ filter = {}, sort = { createdAt: -1 }, skip = 0, limit = 50 } = {}) {
    const collection = await getSosCollection();
    return collection
      .find(filter)
      .sort(sort)
      .skip(Number(skip))
      .limit(Number(limit))
      .toArray();
  }

  /**
   * Count documents matching filter
   * @param {object} filter
   * @returns {Promise<number>}
   */
  static async count(filter = {}) {
    const collection = await getSosCollection();
    return collection.countDocuments(filter);
  }

  /**
   * Find a single SOS message by its custom UUID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  static async findById(id) {
    const collection = await getSosCollection();
    return collection.findOne({ id });
  }

  /**
   * Update status and optional notes for an SOS message
   * @param {string} id
   * @param {object} updateData
   * @returns {Promise<object>}
   */
  static async updateStatus(id, { deliveryStatus, responderNotes }) {
    const collection = await getSosCollection();
    const updateDoc = {
      $set: {
        deliveryStatus: deliveryStatus.toUpperCase(),
        lastUpdatedAt: Date.now(),
      },
    };
    if (responderNotes !== undefined) {
      updateDoc.$set.responderNotes = responderNotes;
    }
    return collection.updateOne({ id }, updateDoc);
  }

  /**
   * Update volunteers array and metadata
   * @param {string} id
   * @param {object} param1
   * @returns {Promise<object>}
   */
  static async updateVolunteers(id, { volunteers, volunteerCount, deliveryStatus }) {
    const collection = await getSosCollection();
    return collection.updateOne(
      { id },
      {
        $set: {
          volunteers,
          volunteerCount,
          deliveryStatus,
          lastUpdatedAt: Date.now(),
        },
      }
    );
  }

  /**
   * Calculate aggregated metrics and statistics
   * @returns {Promise<object>}
   */
  static async getStats() {
    const collection = await getSosCollection();
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

    return {
      total,
      active: activeCount,
      resolved: resolvedCount,
      categories: categoryCounts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
      statuses: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      latestIncidentTime: latest.length ? latest[0].createdAt : null,
    };
  }

  /**
   * Seed batch of sample alerts
   * @param {Array} sampleAlerts
   * @returns {Promise<number>} Number of inserted/updated documents
   */
  static async seed(sampleAlerts) {
    const collection = await getSosCollection();
    let count = 0;
    for (const doc of sampleAlerts) {
      const resUpsert = await collection.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
      if (resUpsert.upsertedCount > 0 || resUpsert.modifiedCount > 0) count++;
    }
    return count;
  }
}

module.exports = SosModel;
