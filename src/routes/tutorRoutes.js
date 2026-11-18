const express = require("express");

const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyTutor,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
  GET /api/tutor/stats

  Returns dashboard statistics for the logged-in tutor.
*/
router.get(
  "/stats",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const db = getDB();

      const tuitionsCollection = db.collection("tuitions");
      const applicationsCollection = db.collection("applications");

      const tutorEmail = req.user.email;

      // Total tuition posts created by this tutor
      const totalTuitions = await tuitionsCollection.countDocuments({
        tutorEmail,
      });

      // Approved + active tuition posts
      const activeApprovedTuitions =
        await tuitionsCollection.countDocuments({
          tutorEmail,
          approvalStatus: "approved",
          isActive: true,
        });

      // Total applicants received for this tutor's tuition posts
      const totalApplicants =
        await applicationsCollection.countDocuments({
          tutorEmail,
        });

      return res.status(200).json({
        success: true,
        data: {
          totalTuitions,
          activeApprovedTuitions,
          totalApplicants,
          plan: req.user.plan || "free",
        },
      });
    } catch (error) {
      console.error("Tutor stats error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load tutor dashboard statistics",
      });
    }
  }
);

module.exports = router;