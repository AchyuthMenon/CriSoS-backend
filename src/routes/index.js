const express = require("express");
const router = express.Router();

const authRoutes = require("./authRoutes");
const sosRoutes = require("./sosRoutes");
const healthRoutes = require("./healthRoutes");

router.use("/auth", authRoutes);
router.use("/sos", sosRoutes);
router.use("/health", healthRoutes);

module.exports = router;
