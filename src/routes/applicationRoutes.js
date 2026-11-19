
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { getTuitionCollection } = require("../models/tuition.model");

const {
  verifyToken,
  verifyTutor,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const getStudentEmail = (req) =>
  String(req.user?.email || "").trim().toLowerCase();

const getTutorEmail = (req) =>
  String(req.user?.email || "").trim().toLowerCase();

const isStudent = (req) =>
  String(req.user?.role || "").toLowerCase() === "student";

const formatApplication = (application) => ({
  ...application,
  _id: application._id.toString(),
});

// ==========================================
// POST: SUBMIT TUITION APPLICATION
// POST /api/applications
// ==========================================

router.post("/", verifyToken, async (req, res) => {
  try {
    if (!isStudent(req)) {
      return res.status(403).json({
        success: false,
        message: "Only students can apply for tuition",
      });
    }

    const {
      tuitionId,
      studentPhone,
      preferredSchedule,
      studentNote,
    } = req.body || {};

    if (
      typeof tuitionId !== "string" ||
      !tuitionId.trim() ||
      tuitionId.trim().length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid tuition ID is required",
      });
    }

    if (
      typeof studentPhone !== "string" ||
      typeof preferredSchedule !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Phone and preferred schedule are required",
      });
    }

    const normalizedPhone = studentPhone.trim();
    const normalizedSchedule = preferredSchedule.trim();

    const normalizedNote =
      typeof studentNote === "string"
        ? studentNote.trim()
        : "";

    const phoneDigits = normalizedPhone.replace(/\D/g, "");

    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid phone number",
      });
    }

    if (
      !normalizedSchedule ||
      normalizedSchedule.length > 200 ||
      normalizedNote.length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid application information",
      });
    }

    const normalizedEmail = getStudentEmail(req);

    if (!normalizedEmail) {
      return res.status(401).json({
        success: false,
        message: "Student email not found in authentication token",
      });
    }

    const tuitionQueryId = ObjectId.isValid(tuitionId)
      ? new ObjectId(tuitionId)
      : tuitionId;

    const tuition = await getTuitionCollection().findOne({
      _id: tuitionQueryId,
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
    }

    if (
      tuition.approvalStatus !== "approved" ||
      tuition.isActive !== true
    ) {
      return res.status(409).json({
        success: false,
        message: "This tuition is not currently accepting applications",
      });
    }

    const applicationsCollection = getDB().collection("applications");

    // Prevent duplicate applications.

    const existingApplication = await applicationsCollection.findOne({
      tuitionId: tuition._id.toString(),
      studentEmail: normalizedEmail,
    });

    if (existingApplication) {
      return res.status(409).json({
        success: false,
        message: "You have already applied for this tuition",
      });
    }

    const application = {
      tuitionId: tuition._id.toString(),
      tuitionTitle: tuition.title,
      subject: tuition.subject,
      monthlyFee: Number(tuition.monthlyFee) || 0,

      tutorEmail: String(tuition.tutorEmail || "")
        .trim()
        .toLowerCase(),

      tutorName: tuition.tutorName || "",

      studentName: req.user.name || "",
      studentEmail: normalizedEmail,
      studentPhone: normalizedPhone,

      preferredSchedule: normalizedSchedule,
      studentNote: normalizedNote,

      status: "pending",
      appliedAt: new Date(),
    };

    const result = await applicationsCollection.insertOne(application);

    return res.status(201).json({
      success: true,
      message: "Tuition application submitted successfully",

      data: {
        applicationId: result.insertedId.toString(),
        ...application,
      },
    });
  } catch (error) {
    console.error("Submit application error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit tuition application",
    });
  }
});

// ==========================================
// GET: TUTOR'S RECEIVED APPLICATIONS
// GET /api/applications/tutor?page=1&limit=10
// Optional: &status=pending
// ==========================================

router.get(
  "/tutor",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const tutorEmail = getTutorEmail(req);

      if (!tutorEmail) {
        return res.status(401).json({
          success: false,
          message: "Tutor email not found",
        });
      }

      const page = Math.max(
        1,
        parseInt(req.query.page, 10) || 1
      );

      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit, 10) || 10)
      );

      const skip = (page - 1) * limit;

      const filter = {
        tutorEmail,
      };

      const requestedStatus = String(
        req.query.status || ""
      ).trim().toLowerCase();

      const validStatuses = [
        "pending",
        "accepted",
        "rejected",
        "cancelled",
      ];

      if (requestedStatus && requestedStatus !== "all") {
        if (!validStatuses.includes(requestedStatus)) {
          return res.status(400).json({
            success: false,
            message: "Invalid application status filter",
          });
        }

        filter.status = requestedStatus;
      }

      const collection = getDB().collection("applications");

      const [applications, totalApplications] = await Promise.all([
        collection
          .find(filter)
          .sort({ appliedAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),

        collection.countDocuments(filter),
      ]);

      const statusCounts = await collection
        .aggregate([
          {
            $match: {
              tutorEmail,
            },
          },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const counts = {
        pending: 0,
        accepted: 0,
        rejected: 0,
        cancelled: 0,
      };

      statusCounts.forEach((item) => {
        if (Object.prototype.hasOwnProperty.call(counts, item._id)) {
          counts[item._id] = item.count;
        }
      });

      return res.status(200).json({
        success: true,
        message: "Tutor applications retrieved successfully",

        data: {
          applications: applications.map(formatApplication),

          statusCounts: counts,

          pagination: {
            currentPage: page,
            limit,
            totalApplications,
            totalPages: Math.ceil(totalApplications / limit),
          },
        },
      });
    } catch (error) {
      console.error("Get tutor applications error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve tutor applications",
      });
    }
  }
);

// ==========================================
// PATCH: ACCEPT OR REJECT APPLICATION
// PATCH /api/applications/:id/status
// Body: { "status": "accepted" }
// ==========================================

router.patch(
  "/:id/status",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body || {};

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid application ID",
        });
      }

      if (!["accepted", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be accepted or rejected",
        });
      }

      const tutorEmail = getTutorEmail(req);

      if (!tutorEmail) {
        return res.status(401).json({
          success: false,
          message: "Tutor email not found",
        });
      }

      const collection = getDB().collection("applications");

      const applicationFilter = {
        _id: new ObjectId(id),
        tutorEmail,
      };

      const application = await collection.findOne(
        applicationFilter
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found or access denied",
        });
      }

      if (application.status !== "pending") {
        return res.status(409).json({
          success: false,
          message:
            `This application has already been ${application.status}`,
        });
      }

      const result = await collection.updateOne(
        {
          ...applicationFilter,
          status: "pending",
        },
        {
          $set: {
            status,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount !== 1) {
        return res.status(409).json({
          success: false,
          message: "Application status could not be updated",
        });
      }

      const updatedApplication = await collection.findOne(
        applicationFilter
      );

      return res.status(200).json({
        success: true,
        message:
          status === "accepted"
            ? "Application accepted successfully"
            : "Application rejected successfully",

        data: formatApplication(updatedApplication),
      });
    } catch (error) {
      console.error("Update application status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update application status",
      });
    }
  }
);

// ==========================================
// GET: STUDENT'S APPLICATIONS
// GET /api/applications?page=1&limit=10
// ==========================================

router.get("/", verifyToken, async (req, res) => {
  try {
    if (!isStudent(req)) {
      return res.status(403).json({
        success: false,
        message: "Only students can view their applications",
      });
    }

    const studentEmail = getStudentEmail(req);

    if (!studentEmail) {
      return res.status(401).json({
        success: false,
        message: "Student email not found",
      });
    }

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const skip = (page - 1) * limit;

    const collection = getDB().collection("applications");

    const filter = {
      studentEmail,
    };

    const [applications, totalApplications] = await Promise.all([
      collection
        .find(filter)
        .sort({ appliedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Student applications retrieved successfully",

      data: {
        applications: applications.map(formatApplication),

        pagination: {
          currentPage: page,
          limit,
          totalApplications,
          totalPages: Math.ceil(totalApplications / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get student applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve student applications",
    });
  }
});

// ==========================================
// PATCH: CANCEL STUDENT APPLICATION
// PATCH /api/applications/:id/cancel
// ==========================================

router.patch("/:id/cancel", verifyToken, async (req, res) => {
  try {
    if (!isStudent(req)) {
      return res.status(403).json({
        success: false,
        message: "Only students can cancel applications",
      });
    }

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID",
      });
    }

    const studentEmail = getStudentEmail(req);

    if (!studentEmail) {
      return res.status(401).json({
        success: false,
        message: "Student email not found",
      });
    }

    const collection = getDB().collection("applications");

    const application = await collection.findOne({
      _id: new ObjectId(id),
      studentEmail,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.status !== "pending") {
      return res.status(409).json({
        success: false,
        message:
          `Cannot cancel an application with status: ${application.status}`,
      });
    }

    const result = await collection.updateOne(
      {
        _id: new ObjectId(id),
        studentEmail,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
      }
    );

    if (result.modifiedCount !== 1) {
      return res.status(409).json({
        success: false,
        message:
          "Application could not be cancelled. Please refresh and try again.",
      });
    }

    const updatedApplication = await collection.findOne({
      _id: new ObjectId(id),
      studentEmail,
    });

    return res.status(200).json({
      success: true,
      message: "Application cancelled successfully",

      data: formatApplication(updatedApplication),
    });
  } catch (error) {
    console.error("Cancel application error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel application",
    });
  }
});

module.exports = router;
