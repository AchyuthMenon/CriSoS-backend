const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const apiRoutes = require("./routes");
const { errorHandler } = require("./middlewares/errorHandler");

const app = express();

// Enable CORS with credentials for cookies across origins
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Mount API routes
app.use("/api", apiRoutes);

// Global Error handling
app.use(errorHandler);

module.exports = app;
