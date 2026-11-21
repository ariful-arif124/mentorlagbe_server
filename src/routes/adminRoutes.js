
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
const getPaymentsCollection = () => getDB().collection("payments");

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
      conditions.push({ approvalStatus });
    }

    if (status === "active") {
      conditions.push({ isActive: true });
    } else if (status === "inactive") {
      conditions.push({ isActive: { $ne: true } });
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
      approvalStatus === "rejected" &&
      tuition.isActive === true;

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
    console.error("Admin applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve applications",
    });
  }
});

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
    console.error("Admin application details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve application details",
    });
  }
});

router.get("/payments/:id", async (req, res) => {
  try {
    const collection = getPaymentsCollection();

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

    const sortOrder =
      typeof req.query.sort === "string"
        ? req.query.sort.toLowerCase()
        : "newest";

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    if (search.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Search query is too long",
      });
    }

    if (!["all", "student", "tutor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment role filter",
      });
    }

    const allowedStatuses = [
      "all",
      "paid",
      "pending",
      "failed",
      "expired",
      "refunded",
      "partially_refunded",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status filter",
      });
    }

    if (!["newest", "oldest"].includes(sortOrder)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment sort order",
      });
    }

    const conditions = [];

    if (role !== "all") {
      conditions.push({ role });
    }

    if (status === "partially_refunded") {
      conditions.push({
        $or: [
          { status: "partially_refunded" },
          { refundStatus: "partial" },
        ],
      });
    } else if (status !== "all") {
      conditions.push({ status });
    }

    if (search) {
      const regex = new RegExp(
        escapeRegex(search),
        "i"
      );

      const searchConditions = [
        { "user.name": regex },
        { "user.email": regex },
        { userName: regex },
        { userEmail: regex },
        { checkoutSessionId: regex },
        { paymentIntentId: regex },
      ];

      if (ObjectId.isValid(search)) {
        searchConditions.push(
          { _id: new ObjectId(search) },
          { userId: new ObjectId(search) }
        );
      }

      conditions.push({
        $or: searchConditions,
      });
    }

    const match =
      conditions.length > 0
        ? { $and: conditions }
        : {};

    const basePipeline = [
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: match,
      },
    ];

    const skip = (page - 1) * limit;

    const [
      payments,
      countResult,
      statsResult,
    ] = await Promise.all([
      collection.aggregate([
        ...basePipeline,
        {
          $sort:
            sortOrder === "oldest"
              ? { createdAt: 1, _id: 1 }
              : { createdAt: -1, _id: -1 },
        },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            userId: 1,
            userName: {
              $ifNull: [
                "$user.name",
                { $ifNull: ["$userName", "Unknown User"] },
              ],
            },
            userEmail: {
              $ifNull: [
                "$userEmail",
                { $ifNull: ["$user.email", ""] },
              ],
            },
            role: {
              $ifNull: ["$role", "$user.role"],
            },
            plan: 1,
            amount: 1,
            currency: 1,
            provider: 1,
            status: 1,
            checkoutSessionId: 1,
            paymentIntentId: 1,
            createdAt: 1,
            updatedAt: 1,
            paidAt: 1,
            refundId: 1,
            refundStatus: 1,
            refundAmount: 1,
            refundedAt: 1,
            stripeEventId: 1,
          },
        },
      ]).toArray(),

      collection.aggregate([
        ...basePipeline,
        { $count: "totalPayments" },
      ]).toArray(),

      collection.aggregate([
        {
          $group: {
            _id: null,

            totalTransactions: {
              $sum: 1,
            },

            paidPayments: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "paid"] },
                  1,
                  0,
                ],
              },
            },

            pendingPayments: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "pending"] },
                  1,
                  0,
                ],
              },
            },

            failedPayments: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "failed"] },
                  1,
                  0,
                ],
              },
            },

            expiredPayments: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "expired"] },
                  1,
                  0,
                ],
              },
            },

            refundedPayments: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$status", "refunded"] },
                      { $eq: ["$status", "partially_refunded"] },
                      { $eq: ["$refundStatus", "partial"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            grossRevenue: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["paid", "refunded", "partially_refunded"],
                    ],
                  },
                  { $ifNull: ["$amount", 0] },
                  0,
                ],
              },
            },

            refundedAmount: {
              $sum: {
                $ifNull: [
                  "$refundAmount",
                  {
                    $cond: [
                      { $eq: ["$status", "refunded"] },
                      { $ifNull: ["$amount", 0] },
                      0,
                    ],
                  },
                ],
              },
            },
          },
        },
      ]).toArray(),
    ]);

    const totalPayments =
      countResult[0]?.totalPayments || 0;

    const summary = statsResult[0] || {};

    const grossRevenue = summary.grossRevenue || 0;
    const refundedAmount = summary.refundedAmount || 0;

    const formattedPayments = payments.map((payment) => {
      const {
        _id,
        userId,
        ...rest
      } = payment;

      return {
        paymentId: _id.toString(),
        userId: userId?.toString() || "",
        ...rest,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Admin payments retrieved successfully",
      data: {
        payments: formattedPayments,
        stats: {
          totalTransactions:
            summary.totalTransactions || 0,
          paidPayments:
            summary.paidPayments || 0,
          pendingPayments:
            summary.pendingPayments || 0,
          failedPayments:
            summary.failedPayments || 0,
          expiredPayments:
            summary.expiredPayments || 0,
          refundedPayments:
            summary.refundedPayments || 0,
          grossRevenue,
          refundedAmount,
          netRevenue: Math.max(
            0,
            grossRevenue - refundedAmount
          ),
        },
        pagination: {
          currentPage: page,
          limit,
          totalPayments,
          totalPages: Math.ceil(totalPayments / limit),
        },
      },
    });
  } catch (error) {
    console.error("Admin payments error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment records",
    });
  }
});

router.get("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID",
      });
    }

    const payment = await getPaymentsCollection().findOne({
      _id: new ObjectId(id),
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    const user = payment.userId
      ? await getUsersCollection().findOne({
          _id: payment.userId,
        })
      : null;

    return res.status(200).json({
      success: true,
      message: "Payment details retrieved successfully",
      data: formatAdminPayment(payment, user || {}),
    });
  } catch (error) {
    console.error("Admin payment details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment details",
    });
  }
});


const formatAdminPayment = (payment, user = null) => ({
    paymentId: payment._id.toString(),
    userId: payment.userId?.toString() || null,
    userName: user?.name || payment.userName || "Unknown User",
    userEmail: user?.email || payment.userEmail || null,
    role: payment.role,
    plan: payment.plan,
    amount: payment.amount,
    currency: (payment.currency || "usd").toUpperCase(),
    provider: payment.provider || "stripe",
    status: payment.status,
    checkoutSessionId: payment.checkoutSessionId || null,
    paymentIntentId: payment.paymentIntentId || null,
    stripeEventId: payment.stripeEventId || null,
    createdAt: payment.createdAt || null,
    updatedAt: payment.updatedAt || null,
    paidAt: payment.paidAt || null,
    refundStatus: payment.refundStatus || null,
    refundedAt: payment.refundedAt || null,
});

router.get("/payments/stats", async (req, res) => {
    try {
        const payments = getPaymentsCollection();

        const [
            totalTransactions,
            successfulTransactions,
            pendingTransactions,
            failedTransactions,
            expiredTransactions,
            studentTransactions,
            tutorTransactions,
            revenueResult,
        ] = await Promise.all([
            payments.countDocuments({}),
            payments.countDocuments({ status: "paid" }),
            payments.countDocuments({ status: "pending" }),
            payments.countDocuments({ status: "failed" }),
            payments.countDocuments({ status: "expired" }),
            payments.countDocuments({ role: "student" }),
            payments.countDocuments({ role: "tutor" }),
            payments.aggregate([
                {
                    $match: {
                        status: "paid",
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalRevenueCents: {
                            $sum: "$amount",
                        },
                    },
                },
            ]).toArray(),
        ]);

        const totalRevenueCents =
            revenueResult[0]?.totalRevenueCents || 0;

        return res.status(200).json({
            success: true,
            message: "Payment statistics retrieved successfully",
            data: {
                totalTransactions,
                successfulTransactions,
                pendingTransactions,
                failedTransactions,
                expiredTransactions,
                studentTransactions,
                tutorTransactions,
                totalRevenue: totalRevenueCents / 100,
                totalRevenueCents,
                currency: "USD",
            },
        });
    } catch (error) {
        console.error("Admin payment statistics error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment statistics",
        });
    }
});

router.get("/payments", async (req, res) => {
    try {
        const search =
            typeof req.query.search === "string"
                ? req.query.search.trim()
                : "";

        const status =
            typeof req.query.status === "string"
                ? req.query.status.trim().toLowerCase()
                : "all";

        const role =
            typeof req.query.role === "string"
                ? req.query.role.trim().toLowerCase()
                : "all";

        const method =
            typeof req.query.method === "string"
                ? req.query.method.trim().toLowerCase()
                : "all";

        const dateFromValue =
            typeof req.query.dateFrom === "string"
                ? req.query.dateFrom.trim()
                : "";

        const dateToValue =
            typeof req.query.dateTo === "string"
                ? req.query.dateTo.trim()
                : "";

        const sortBy =
            typeof req.query.sortBy === "string"
                ? req.query.sortBy
                : "createdAt";

        const sortOrder =
            typeof req.query.sortOrder === "string"
                ? req.query.sortOrder.toLowerCase()
                : "desc";

        const page = Math.max(
            1,
            parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit, 10) || 10)
        );

        if (search.length > 120) {
            return res.status(400).json({
                success: false,
                message: "Search query is too long",
            });
        }

        if (
            !["all", "pending", "paid", "failed", "expired"].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment status filter",
            });
        }

        if (!["all", "student", "tutor"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment role filter",
            });
        }

        if (!["all", "stripe"].includes(method)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment method filter",
            });
        }

        if (!["createdAt", "paidAt", "amount", "status", "userName"].includes(sortBy)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment sorting field",
            });
        }

        if (!["asc", "desc"].includes(sortOrder)) {
            return res.status(400).json({
                success: false,
                message: "Invalid sorting order",
            });
        }

        const dateFrom = dateFromValue
            ? new Date(dateFromValue)
            : null;

        const dateTo = dateToValue
            ? /^\d{4}-\d{2}-\d{2}$/.test(dateToValue)
                ? new Date(`${dateToValue}T23:59:59.999Z`)
                : new Date(dateToValue)
            : null;

        if (
            (dateFrom && Number.isNaN(dateFrom.getTime())) ||
            (dateTo && Number.isNaN(dateTo.getTime()))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment date filter",
            });
        }

        if (dateFrom && dateTo && dateFrom > dateTo) {
            return res.status(400).json({
                success: false,
                message: "Start date cannot be after end date",
            });
        }

        const filter = {};

        if (status !== "all") {
            filter.status = status;
        }

        if (role !== "all") {
            filter.role = role;
        }

        if (method !== "all") {
            filter.provider = method;
        }

        if (dateFrom || dateTo) {
            filter.createdAt = {};

            if (dateFrom) {
                filter.createdAt.$gte = dateFrom;
            }

            if (dateTo) {
                filter.createdAt.$lte = dateTo;
            }
        }

        const pipeline = [
            {
                $match: filter,
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "paymentUser",
                },
            },
            {
                $unwind: {
                    path: "$paymentUser",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $addFields: {
                    paymentId: {
                        $toString: "$_id",
                    },
                    userIdText: {
                        $toString: "$userId",
                    },
                    userName: {
                        $ifNull: ["$paymentUser.name", ""],
                    },
                    userEmail: {
                        $ifNull: [
                            "$paymentUser.email",
                            {
                                $ifNull: ["$userEmail", ""],
                            },
                        ],
                    },
                },
            },
        ];

        if (search) {
            const searchRegex = new RegExp(
                escapeRegex(search),
                "i"
            );

            pipeline.push({
                $match: {
                    $or: [
                        { paymentId: searchRegex },
                        { userIdText: searchRegex },
                        { userName: searchRegex },
                        { userEmail: searchRegex },
                        { checkoutSessionId: searchRegex },
                        { paymentIntentId: searchRegex },
                    ],
                },
            });
        }

        const skip = (page - 1) * limit;

        const sortDirection = sortOrder === "asc" ? 1 : -1;

        pipeline.push({
            $facet: {
                payments: [
                    {
                        $sort: {
                            [sortBy]: sortDirection,
                            _id: sortDirection,
                        },
                    },
                    {
                        $skip: skip,
                    },
                    {
                        $limit: limit,
                    },
                    {
                        $project: {
                            _id: 1,
                            paymentId: 1,
                            userId: 1,
                            userName: 1,
                            userEmail: 1,
                            role: 1,
                            plan: 1,
                            amount: 1,
                            currency: 1,
                            provider: 1,
                            status: 1,
                            checkoutSessionId: 1,
                            paymentIntentId: 1,
                            stripeEventId: 1,
                            createdAt: 1,
                            updatedAt: 1,
                            paidAt: 1,
                            refundStatus: 1,
                            refundedAt: 1,
                        },
                    },
                ],
                metadata: [
                    {
                        $count: "totalPayments",
                    },
                ],
            },
        });

        const result = await getPaymentsCollection()
            .aggregate(pipeline)
            .toArray();

        const paymentData = result[0];

        const paymentList = paymentData?.payments || [];

        const totalPayments =
            paymentData?.metadata[0]?.totalPayments || 0;

        return res.status(200).json({
            success: true,
            message: "Payment transactions retrieved successfully",
            data: {
                payments: paymentList.map((payment) =>
                    formatAdminPayment(payment)
                ),
                pagination: {
                    currentPage: page,
                    limit,
                    totalPayments,
                    totalPages: Math.ceil(totalPayments / limit),
                },
            },
        });
    } catch (error) {
        console.error("Admin payment list error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment transactions",
        });
    }
});

router.get("/payments/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment ID",
            });
        }

        const payment = await getPaymentsCollection().findOne({
            _id: new ObjectId(id),
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment transaction not found",
            });
        }

        const user = payment.userId
            ? await getUsersCollection().findOne(
                {
                    _id: payment.userId,
                },
                {
                    projection: {
                        name: 1,
                        email: 1,
                        role: 1,
                    },
                }
            )
            : null;

        return res.status(200).json({
            success: true,
            message: "Payment details retrieved successfully",
            data: formatAdminPayment(payment, user),
        });
    } catch (error) {
        console.error("Admin payment details error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment details",
        });
    }
});


module.exports = router;
