const express = require("express");
const router = express.Router();
const sosController = require("../controllers/sosController");

// Collection-level routes
router.get("/", sosController.getSosMessages);
router.post("/", sosController.createSos);
router.get("/stats", sosController.getSosStats);
router.post("/seed", sosController.seedSos);

// Item-level routes
router.get("/:id", sosController.getSosById);
router.patch("/:id/status", sosController.updateSosStatus);
router.post("/:id/volunteer", sosController.toggleVolunteer);

module.exports = router;
