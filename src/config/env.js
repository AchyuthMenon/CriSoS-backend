require("dotenv").config();

const env = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || "crisos_jwt_super_secret_key_2026",
  MONGODB_URI: process.env.MONGODB_URI || "",
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "crisos",
  MONGODB_COLLECTION_NAME: process.env.MONGODB_COLLECTION_NAME || "sos_messages",
  NODE_ENV: process.env.NODE_ENV || "development",
};

module.exports = env;
