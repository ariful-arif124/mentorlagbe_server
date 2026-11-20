
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");

const {
  verifyToken,
  verifyAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken, verifyAdmin);

const getUsersCollection = () => getDB().collection("users");

const getTuitionsCollection = () => getDB().collection("tuitions");

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getTuitionId = (id) =>
  ObjectId.isValid(id) ? new ObjectId(id) : id;

const formatUser = (user) => ({
  userId: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  plan: user.plan || "free",
  isActive: user.isActive !== false,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const formatAdminTuition = (tuition) => ({
  ...tuition,
  _id: tuition._id.toString(),
  approvalStatus: tuition.approvalStatus || "pending",
  isActive: tuition.isActive === true,
});

const formatAdminApplication = (application) => ({
  ...application,
  _id: application._id.toString(),
});

// ============================================
// ADMIN DASHBOARD STATISTICS
// GET /api/admin/stats
// ============================================

router.get("/stats", async (req, res) => {
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
      rejectedTuitions,
      activeTuitions,
      totalApplications,
    ] = await Promise.all([
      users.countDocuments({}),
      users.countDocuments({ role: "student" }),
      users.countDocuments({ role: "tutor" }),
      users.countDocuments({ role: "admin" }),

      tuitions.countDocuments({}),

      tuitions.countDocuments({
        $or: [
          { approvalStatus: "pending" },
          { approvalStatus: null },
        ],
      }),

      tuitions.countDocuments({
        approvalStatus: "approved",
      }),

      tuitions.countDocuments({
        approvalStatus: "rejected",
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
          rejected: rejectedTuitions,
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
});

// ============================================
// USER MANAGEMENT
// GET /api/admin/users
// ============================================

router.get("/users", async (req, res) => {
  try {
    const collection = getUsersCollection();

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const role =
      typeof req.query.role === "string"
        ? req.query.role.trim().toLowerCase()
        : "all";

    const status =
      typeof req.query.status === "string"
        ? req.query.status.trim().toLowerCase()
        : "all";

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const allowedRoles = [
      "all",
      "student",
      "tutor",
      "admin",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role filter",
      });
    }

    if (!["all", "active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user status filter",
      });
    }

    const filter = {};

    if (role !== "all") {
      filter.role = role;
    }

    if (status === "active") {
      filter.isActive = { $ne: false };
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    if (search) {
      const searchRegex = new RegExp(
        escapeRegex(search),
        "i"
      );

      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: {
        users: users.map(formatUser),
        pagination: {
          currentPage: page,
          limit,
          totalUsers,
          totalPages: Math.ceil(totalUsers / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get users error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve users",
    });
  }
});

// ============================================
// GET INDIVIDUAL USER
// GET /api/admin/users/:id
// ============================================

router.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await getUsersCollection().findOne({
      _id: new ObjectId(id),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User details retrieved successfully",
      data: formatUser(user),
    });
  } catch (error) {
    console.error("Get user details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user details",
    });
  }
});

// ============================================
// ACTIVATE / DEACTIVATE USER
// PATCH /api/admin/users/:id/status
// ============================================

router.patch("/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body || {};

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const collection = getUsersCollection();

    const targetUser = await collection.findOne({
      _id: new ObjectId(id),
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (
      targetUser._id.toString() === req.user.userId &&
      isActive === false
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot deactivate your own account",
      });
    }

    if ((targetUser.isActive !== false) === isActive) {
      return res.status(200).json({
        success: true,
        message: "User status is already up to date",
        data: formatUser(targetUser),
      });
    }

    if (
      targetUser.role === "admin" &&
      isActive === false
    ) {
      const activeAdmins = await collection.countDocuments({
        role: "admin",
        isActive: { $ne: false },
      });

      if (activeAdmins <= 1) {
        return res.status(409).json({
          success: false,
          message: "Cannot deactivate the last active Admin",
        });
      }
    }

    const updatedAt = new Date();

    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isActive,
          updatedAt,
        },
      }
    );

    const updatedUser = {
      ...targetUser,
      isActive,
      updatedAt,
    };

    return res.status(200).json({
      success: true,
      message: isActive
        ? "User account activated successfully"
        : "User account deactivated successfully",
      data: formatUser(updatedUser),
    });
  } catch (error) {
    console.error("Update user status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
    });
  }
});

// ============================================
// TUITION MANAGEMENT
// GET /api/admin/tuitions
// ============================================

router.get("/tuitions", async (req, res) => {
  try {
    const collection = getTuitionsCollection();

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const approvalStatus =
      typeof req.query.approvalStatus === "string"
        ? req.query.approvalStatus.toLowerCase()
        : "all";

    const status =
      typeof req.query.status === "string"
        ? req.query.status.toLowerCase()
        : "all";

    const subject =
      typeof req.query.subject === "string"
        ? req.query.subject.trim()
        : "";

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    if (
      !["all", "pending", "approved", "rejected"].includes(
        approvalStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval status filter",
      });
    }

    if (!["all", "active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition status filter",
      });
    }

    const conditions = [];

    if (approvalStatus === "pending") {
      conditions.push({
        $or: [
          { approvalStatus: "pending" },
          { approvalStatus: null },
        ],
      });
    } else if (approvalStatus !== "all") {
      conditions.push({
        approvalStatus,
      });
    }

    if (status === "active") {
      conditions.push({
        isActive: true,
      });
    } else if (status === "inactive") {
      conditions.push({
        isActive: { $ne: true },
      });
    }

    if (subject) {
      conditions.push({
        subject: new RegExp(
          `^${escapeRegex(subject)}$`,
          "i"
        ),
      });
    }

    if (search) {
      const searchRegex = new RegExp(
        escapeRegex(search),
        "i"
      );

      conditions.push({
        $or: [
          { title: searchRegex },
          { tutorName: searchRegex },
          { tutorEmail: searchRegex },
          { description: searchRegex },
          { location: searchRegex },
          { subject: searchRegex },
        ],
      });
    }

    const filter =
      conditions.length > 0
        ? { $and: conditions }
        : {};

    const skip = (page - 1) * limit;

    const [tuitions, totalTuitions] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Tuitions retrieved successfully",
      data: {
        tuitions: tuitions.map(formatAdminTuition),
        pagination: {
          currentPage: page,
          limit,
          totalTuitions,
          totalPages: Math.ceil(totalTuitions / limit),
        },
      },
    });
  } catch (error) {
    console.error("Admin get tuitions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tuitions",
    });
  }
});

// ============================================
// GET INDIVIDUAL TUITION
// GET /api/admin/tuitions/:id
// ============================================

router.get("/tuitions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    const tuition = await getTuitionsCollection().findOne({
      _id: getTuitionId(id),
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Tuition details retrieved successfully",
      data: formatAdminTuition(tuition),
    });
  } catch (error) {
    console.error("Admin tuition details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tuition details",
    });
  }
});

// ============================================
// APPROVE / REJECT TUITION
// PATCH /api/admin/tuitions/:id/approval
// ============================================

router.patch("/tuitions/:id/approval", async (req, res) => {
  try {
    const { id } = req.params;

    const approvalStatus =
      typeof req.body?.approvalStatus === "string"
        ? req.body.approvalStatus.trim().toLowerCase()
        : "";

    if (!id || id.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Approval status must be approved or rejected",
      });
    }

    const collection = getTuitionsCollection();
    const tuitionId = getTuitionId(id);

    const tuition = await collection.findOne({
      _id: tuitionId,
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
    }

    const currentApprovalStatus =
      tuition.approvalStatus || "pending";

    const shouldDeactivate =
      approvalStatus === "rejected" && tuition.isActive === true;

    if (
      currentApprovalStatus === approvalStatus &&
      !shouldDeactivate
    ) {
      return res.status(200).json({
        success: true,
        message: `Tuition is already ${approvalStatus}`,
        data: formatAdminTuition(tuition),
      });
    }

    const updatedAt = new Date();

    const isActive =
      approvalStatus === "rejected"
        ? false
        : tuition.isActive === true;

    await collection.updateOne(
      { _id: tuitionId },
      {
        $set: {
          approvalStatus,
          isActive,
          reviewedAt: updatedAt,
          reviewedBy: req.user.userId,
          updatedAt,
        },
      }
    );

    const updatedTuition = await collection.findOne({
      _id: tuitionId,
    });

    return res.status(200).json({
      success: true,
      message:
        approvalStatus === "approved"
          ? "Tuition approved successfully"
          : "Tuition rejected successfully",
      data: formatAdminTuition(updatedTuition),
    });
  } catch (error) {
    console.error("Tuition approval error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update tuition approval status",
    });
  }
});

// ============================================
// ACTIVATE / DEACTIVATE TUITION
// PATCH /api/admin/tuitions/:id/status
// ============================================

router.patch("/tuitions/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body || {};

    if (!id || id.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const collection = getTuitionsCollection();
    const tuitionId = getTuitionId(id);

    const tuition = await collection.findOne({
      _id: tuitionId,
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
    }

    if (isActive && tuition.approvalStatus !== "approved") {
      return res.status(409).json({
        success: false,
        message: "Only approved tuitions can be activated",
      });
    }

    if (tuition.isActive === isActive) {
      return res.status(200).json({
        success: true,
        message: "Tuition status is already up to date",
        data: formatAdminTuition(tuition),
      });
    }

    const updatedAt = new Date();

    await collection.updateOne(
      { _id: tuitionId },
      {
        $set: {
          isActive,
          updatedAt,
        },
      }
    );

    const updatedTuition = await collection.findOne({
      _id: tuitionId,
    });

    return res.status(200).json({
      success: true,
      message: isActive
        ? "Tuition activated successfully"
        : "Tuition deactivated successfully",
      data: formatAdminTuition(updatedTuition),
    });
  } catch (error) {
    console.error("Tuition status update error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update tuition status",
    });
  }
});


// ============================================
// ADMIN APPLICATION MANAGEMENT
// GET /api/admin/applications
// ============================================

router.get("/applications", async (req, res) => {
  try {
    const collection = getDB().collection("applications");

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const status =
      typeof req.query.status === "string"
        ? req.query.status.trim().toLowerCase()
        : "all";

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const validStatuses = [
      "all",
      "pending",
      "accepted",
      "rejected",
      "cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application status filter",
      });
    }

    if (search.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Search query is too long",
      });
    }

    const conditions = [];

    // Status filtering
    if (status === "pending") {
      conditions.push({
        $or: [
          { status: "pending" },
          { status: null },
        ],
      });
    } else if (status !== "all") {
      conditions.push({ status });
    }

    // Search filtering
    if (search) {
      const regex = new RegExp(
        escapeRegex(search),
        "i"
      );

      conditions.push({
        $or: [
          { studentName: regex },
          { studentEmail: regex },
          { studentPhone: regex },
          { tutorName: regex },
          { tutorEmail: regex },
          { tuitionTitle: regex },
          { subject: regex },
          { tuitionId: regex },
        ],
      });
    }

    const filter =
      conditions.length > 0
        ? { $and: conditions }
        : {};

    const skip = (page - 1) * limit;

    // Application statistics
    const [
      applications,
      totalApplications,
      total,
      pending,
      accepted,
      rejected,
      cancelled,
    ] = await Promise.all([
      collection
        .find(filter)
        .sort({ appliedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(filter),

      collection.countDocuments({}),

      collection.countDocuments({
        $or: [
          { status: "pending" },
          { status: null },
        ],
      }),

      collection.countDocuments({
        status: "accepted",
      }),

      collection.countDocuments({
        status: "rejected",
      }),

      collection.countDocuments({
        status: "cancelled",
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Admin applications retrieved successfully",

      data: {
        applications: applications.map(
          formatAdminApplication
        ),

        stats: {
          total,
          pending,
          accepted,
          rejected,
          cancelled,
        },

        pagination: {
          currentPage: page,
          limit,
          totalApplications,
          totalPages: Math.ceil(
            totalApplications / limit
          ),
        },
      },
    });

  } catch (error) {
    console.error(
      "Admin applications error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve applications",
    });
  }
});


// ============================================
// ADMIN APPLICATION DETAILS
// GET /api/admin/applications/:id
// ============================================

router.get("/applications/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID",
      });
    }

    const collection = getDB().collection("applications");

    const application = await collection.findOne({
      _id: new ObjectId(id),
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Application details retrieved successfully",

      data: formatAdminApplication(application),
    });

  } catch (error) {
    console.error(
      "Admin application details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve application details",
    });
  }
});


module.exports = router;
