
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { getTuitionCollection } = require("../models/tuition.model");
const {
  verifyToken,
  verifyTutor,
} = require("../middleware/authMiddleware");

const router = express.Router();

const FREE_PLAN_LIMIT = 2;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const getTutorEmail = (req) =>
  String(req.user?.email || "").trim().toLowerCase();

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatTuition = (tuition) => ({
  ...tuition,
  _id: tuition._id.toString(),
});

const getTuitionId = (id) =>
  ObjectId.isValid(id) ? new ObjectId(id) : id;

const validateTuition = (body = {}) => {
  const title = String(body.title || "").trim();
  const subject = String(body.subject || "").trim();
  const classLevel = String(body.classLevel || "").trim();
  const location = String(body.location || "").trim();
  const description = String(body.description || "").trim();
  const bannerImage = String(body.bannerImage || "").trim();

  const monthlyFee = Number(body.monthlyFee);
  const daysPerWeek = Number(body.daysPerWeek);

  const requestedMode = String(body.mode || "")
    .trim()
    .toLowerCase();

  const modes = {
    online: "Online",
    offline: "Offline",
    hybrid: "Hybrid",
  };

  const mode = modes[requestedMode];

  if (
    !title ||
    !subject ||
    !classLevel ||
    !location ||
    !description ||
    !mode
  ) {
    return {
      error: "Please complete all required tuition fields",
    };
  }

  if (title.length > 120) {
    return { error: "Title cannot exceed 120 characters" };
  }

  if (subject.length > 80) {
    return { error: "Subject cannot exceed 80 characters" };
  }

  if (classLevel.length > 80) {
    return { error: "Class level cannot exceed 80 characters" };
  }

  if (location.length > 150) {
    return { error: "Location cannot exceed 150 characters" };
  }

  if (description.length > 3000) {
    return { error: "Description cannot exceed 3000 characters" };
  }

  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) {
    return { error: "Please provide a valid monthly fee" };
  }

  if (
    !Number.isInteger(daysPerWeek) ||
    daysPerWeek < 1 ||
    daysPerWeek > 7
  ) {
    return { error: "Days per week must be between 1 and 7" };
  }

  if (bannerImage.length > 2000) {
    return { error: "Banner image URL is too long" };
  }

  if (bannerImage) {
    try {
      const parsedUrl = new URL(bannerImage);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return { error: "Invalid banner image URL" };
      }
    } catch {
      return { error: "Please provide a valid banner image URL" };
    }
  }

  return {
    data: {
      title,
      subject,
      classLevel,
      monthlyFee,
      daysPerWeek,
      mode,
      location,
      description,
      bannerImage,
    },
  };
};

// ==========================================
// GET: TUTOR DASHBOARD STATISTICS
// GET /api/tutor/stats
// ==========================================

router.get("/stats", verifyToken, verifyTutor, async (req, res) => {
  try {
    const db = getDB();

    const tuitionsCollection = db.collection("tuitions");
    const applicationsCollection = db.collection("applications");

    const tutorEmail = getTutorEmail(req);

    const emailRegex = new RegExp(
      `^${escapeRegex(tutorEmail)}$`,
      "i"
    );

    const totalTuitions =
      await tuitionsCollection.countDocuments({
        tutorEmail: emailRegex,
      });

    const activeApprovedTuitions =
      await tuitionsCollection.countDocuments({
        tutorEmail: emailRegex,
        approvalStatus: "approved",
        isActive: true,
      });

    const totalApplicants =
      await applicationsCollection.countDocuments({
        tutorEmail: emailRegex,
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
});

// ==========================================
// POST: CREATE TUITION
// POST /api/tutor/tuitions
// ==========================================

router.post(
  "/tuitions",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const validation = validateTuition(req.body);

      if (validation.error) {
        return res.status(400).json({
          success: false,
          message: validation.error,
        });
      }

      const tutorEmail = getTutorEmail(req);
      const plan = String(req.user.plan || "free").toLowerCase();

      const collection = getTuitionCollection();

      // Free plan allows only 2 tuition posts.

      if (plan !== "pro") {
        const existingCount = await collection.countDocuments({
          tutorEmail: new RegExp(
            `^${escapeRegex(tutorEmail)}$`,
            "i"
          ),
        });

        if (existingCount >= FREE_PLAN_LIMIT) {
          return res.status(403).json({
            success: false,
            code: "TUITION_LIMIT_REACHED",
            message:
              "Your Free plan allows only 2 tuition posts. Upgrade to Pro for unlimited posts.",
          });
        }
      }

      const now = new Date();

      const tuition = {
        ...validation.data,

        tutorEmail,
        tutorName: req.user.name || "",

        approvalStatus: "pending",
        isActive: false,

        createdAt: now,
        updatedAt: now,
      };

      const result = await collection.insertOne(tuition);

      return res.status(201).json({
        success: true,
        message:
          "Tuition submitted successfully. Waiting for admin approval.",
        data: formatTuition({
          ...tuition,
          _id: result.insertedId,
        }),
      });
    } catch (error) {
      console.error("Create tuition error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create tuition",
      });
    }
  }
);

// ==========================================
// GET: TUTOR'S OWN TUITIONS
// GET /api/tutor/tuitions
// ==========================================

router.get(
  "/tuitions",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const tutorEmail = getTutorEmail(req);

      const tuitions = await getTuitionCollection()
        .find({
          tutorEmail: new RegExp(
            `^${escapeRegex(tutorEmail)}$`,
            "i"
          ),
        })
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        message: "Tutor tuitions retrieved successfully",
        count: tuitions.length,
        data: tuitions.map(formatTuition),
      });
    } catch (error) {
      console.error("Get tutor tuitions error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve tutor tuitions",
      });
    }
  }
);

// ==========================================
// GET: SINGLE TUTOR TUITION
// GET /api/tutor/tuitions/:id
// ==========================================

router.get(
  "/tuitions/:id",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const tuition = await getTuitionCollection().findOne({
        _id: getTuitionId(req.params.id),
        tutorEmail: new RegExp(
          `^${escapeRegex(getTutorEmail(req))}$`,
          "i"
        ),
      });

      if (!tuition) {
        return res.status(404).json({
          success: false,
          message: "Tuition not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: formatTuition(tuition),
      });
    } catch (error) {
      console.error("Get single tutor tuition error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve tuition details",
      });
    }
  }
);

// ==========================================
// PUT: UPDATE TUITION
// PUT /api/tutor/tuitions/:id
// ==========================================

router.put(
  "/tuitions/:id",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const validation = validateTuition(req.body);

      if (validation.error) {
        return res.status(400).json({
          success: false,
          message: validation.error,
        });
      }

      const collection = getTuitionCollection();

      const filter = {
        _id: getTuitionId(req.params.id),
        tutorEmail: new RegExp(
          `^${escapeRegex(getTutorEmail(req))}$`,
          "i"
        ),
      };

      const existingTuition = await collection.findOne(filter);

      if (!existingTuition) {
        return res.status(404).json({
          success: false,
          message: "Tuition not found or access denied",
        });
      }

      // Every edited listing must be reviewed by admin again.

      const result = await collection.updateOne(
        filter,
        {
          $set: {
            ...validation.data,
            approvalStatus: "pending",
            isActive: false,
            updatedAt: new Date(),
          },
          $unset: {
            reviewedAt: "",
            reviewedBy: "",
          },
        }
      );

      if (result.modifiedCount !== 1) {
        return res.status(400).json({
          success: false,
          message: "No tuition changes were saved",
        });
      }

      const updatedTuition = await collection.findOne(filter);

      return res.status(200).json({
        success: true,
        message:
          "Tuition updated successfully and submitted for admin review",
        data: formatTuition(updatedTuition),
      });
    } catch (error) {
      console.error("Update tuition error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update tuition",
      });
    }
  }
);

// ==========================================
// PATCH: ACTIVATE / DEACTIVATE TUITION
// PATCH /api/tutor/tuitions/:id/active
// Body: { "isActive": true }
// ==========================================

router.patch(
  "/tuitions/:id/active",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const { isActive } = req.body || {};

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isActive must be true or false",
        });
      }

      const collection = getTuitionCollection();

      const filter = {
        _id: getTuitionId(req.params.id),
        tutorEmail: new RegExp(
          `^${escapeRegex(getTutorEmail(req))}$`,
          "i"
        ),
      };

      const tuition = await collection.findOne(filter);

      if (!tuition) {
        return res.status(404).json({
          success: false,
          message: "Tuition not found or access denied",
        });
      }

      if (
        isActive === true &&
        tuition.approvalStatus !== "approved"
      ) {
        return res.status(409).json({
          success: false,
          message: "Only admin-approved tuitions can be activated",
        });
      }

      await collection.updateOne(
        filter,
        {
          $set: {
            isActive,
            updatedAt: new Date(),
          },
        }
      );

      const updatedTuition = await collection.findOne(filter);

      return res.status(200).json({
        success: true,
        message: isActive
          ? "Tuition activated successfully"
          : "Tuition deactivated successfully",
        data: formatTuition(updatedTuition),
      });
    } catch (error) {
      console.error("Toggle tuition status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update tuition status",
      });
    }
  }
);

// ==========================================
// DELETE: DELETE OWN TUITION
// DELETE /api/tutor/tuitions/:id
// ==========================================

router.delete(
  "/tuitions/:id",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const filter = {
        _id: getTuitionId(req.params.id),
        tutorEmail: new RegExp(
          `^${escapeRegex(getTutorEmail(req))}$`,
          "i"
        ),
      };

      const result = await getTuitionCollection().deleteOne(filter);

      if (result.deletedCount !== 1) {
        return res.status(404).json({
          success: false,
          message: "Tuition not found or access denied",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Tuition deleted successfully",
      });
    } catch (error) {
      console.error("Delete tuition error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete tuition",
      });
    }
  }
);

module.exports = router;
