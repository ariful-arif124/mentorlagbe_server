
const express = require("express");
const router = express.Router();

const {
  getAllTuitions,
  getFeaturedTuitions,
  getTuitionById,
} = require("../controllers/tuition.controller");

// Get featured tuitions
router.get("/featured", getFeaturedTuitions);

// Get all tuitions with filters
router.get("/", getAllTuitions);

// Get tuition details
router.get("/:id", getTuitionById);

module.exports = router;
