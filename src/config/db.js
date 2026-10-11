const { MongoClient } = require("mongodb");
const env = require("./env");

let mongoClient = null;
let db = null;
let sosCollection = null;
let usersCollection = null;

/**
 * Connect to MongoDB Atlas and retrieve database instance
 */
async function connectDb() {
  if (db) return db;

  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not configured");
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    console.log("[MongoDB] Connected to MongoDB Atlas");
  }

  db = mongoClient.db(env.MONGODB_DB_NAME);
  return db;
}

/**
 * Connect to MongoDB Atlas and ensure unique index on the SOS UUID
 */
async function getSosCollection() {
  if (sosCollection) return sosCollection;

  const database = await connectDb();
  sosCollection = database.collection(env.MONGODB_COLLECTION_NAME);

  // Ensure unique index on SOS id for idempotency
  await sosCollection.createIndex({ id: 1 }, { unique: true });
  return sosCollection;
}

/**
 * Connect to MongoDB Atlas and ensure unique index on users table
 */
async function getUsersCollection() {
  if (usersCollection) return usersCollection;

  const database = await connectDb();
  usersCollection = database.collection("users");

  // Ensure unique index on username
  await usersCollection.createIndex({ username: 1 }, { unique: true });
  return usersCollection;
}

/**
 * Close MongoDB client connection (useful for testing and graceful shutdown)
 */
async function closeDb() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
    sosCollection = null;
    usersCollection = null;
    console.log("[MongoDB] Closed connection to MongoDB Atlas");
  }
}

module.exports = {
  connectDb,
  getSosCollection,
  getUsersCollection,
  closeDb,
};
