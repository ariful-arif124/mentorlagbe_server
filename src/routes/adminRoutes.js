
const express = require("express");

const { getDB } = require("../config/db");

const {
  verifyToken,
  verifyAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/admin/stats
// Admin dashboard statistics

router.get(
  "/stats",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const db = getDB();

      const users = db.collection("users");
      const tuitions = db.collection("tuitions");
      const applications = db.collection("applications");

      const [
        totalUsers,
        totalStudents,
        totalTutors,
        totalAdmins,
        totalTuitions,
        pendingTuitions,
        approvedTuitions,
        activeTuitions,
        totalApplications,
      ] = await Promise.all([
        users.countDocuments({}),
        users.countDocuments({ role: "student" }),
        users.countDocuments({ role: "tutor" }),
        users.countDocuments({ role: "admin" }),

        tuitions.countDocuments({}),
        tuitions.countDocuments({
          approvalStatus: "pending",
        }),
        tuitions.countDocuments({
          approvalStatus: "approved",
        }),
        tuitions.countDocuments({
          approvalStatus: "approved",
          isActive: true,
        }),

        applications.countDocuments({}),
      ]);

      return res.status(200).json({
        success: true,
        message: "Admin dashboard statistics loaded",
        data: {
          users: {
            total: totalUsers,
            students: totalStudents,
            tutors: totalTutors,
            admins: totalAdmins,
          },
          tuitions: {
            total: totalTuitions,
            pending: pendingTuitions,
            approved: approvedTuitions,
            active: activeTuitions,
          },
          totalApplications,
        },
      });
    } catch (error) {
      console.error("Admin stats error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load admin dashboard statistics",
      });
    }
  }
);

module.exports = router;
