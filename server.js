const app = require("./src/app");
const env = require("./src/config/env");
const { getSosCollection } = require("./src/config/db");
const { validateSosDto } = require("./src/utils/validators");

const PORT = env.PORT;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[CriSOS Backend] Listening on port ${PORT}`);
    if (!env.MONGODB_URI) {
      console.log(
        "[CriSOS Backend] NOTE: MONGODB_URI is not set in .env. Configure it before uploading live SOS alerts."
      );
    }
  });
}

// Backward compatibility exports for existing tests and consumers
module.exports = {
  app,
  validateSosDto,
  getCollection: getSosCollection,
};
