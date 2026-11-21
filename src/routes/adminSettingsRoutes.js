
const express = require("express");
const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken, verifyAdmin);

const SETTINGS_ID = "mentorlagbe_admin_settings";

const getSettingsCollection = () =>
  getDB().collection("admin_settings");

const getUsersCollection = () =>
  getDB().collection("users");

const defaultSettings = {
  platform: {
    platformName: "MentorLagbe",
    contactEmail: "",
    supportEmail: "",
    supportPhone: "",
    maintenanceMode: false,
  },
  notifications: {
    newUserRegistration: true,
    newTuitionSubmission: true,
    newApplication: true,
    paymentUpdates: true,
    adminAlerts: true,
  },
};

const getAdminId = (req) => {
  const id = req.user?.userId;
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
};

const getAdmin = async (req) => {
  const id = getAdminId(req);

  if (!id) return null;

  return getUsersCollection().findOne(
    { _id: id, role: "admin" },
    {
      projection: {
        password: 0,
        passwordHash: 0,
        hashedPassword: 0,
      },
    }
  );
};

const getSettingsData = async (req) => {
  const [settings, admin] = await Promise.all([
    getSettingsCollection().findOne({
      _id: SETTINGS_ID,
    }),
    getAdmin(req),
  ]);

  return {
    platform: {
      ...defaultSettings.platform,
      ...(settings?.platform || {}),
    },
    notifications: {
      ...defaultSettings.notifications,
      ...(settings?.notifications || {}),
    },
    profile: admin
      ? {
          userId: admin._id.toString(),
          name: admin.name || "",
          email: admin.email || "",
          role: admin.role,
          phone: admin.phone || "",
          bio: admin.bio || "",
          image: admin.image || admin.profileImage || "",
          createdAt: admin.createdAt || null,
        }
      : null,
    security: {
      passwordUpdatedAt: admin?.passwordUpdatedAt || null,
    },
    updatedAt: settings?.updatedAt || null,
  };
};

const validateSection = (section, values) => {
  const allowedFields = Object.keys(
    defaultSettings[section]
  );

  const updates = {};

  for (const field of allowedFields) {
    if (
      !Object.prototype.hasOwnProperty.call(
        values,
        field
      )
    ) {
      continue;
    }

    const value = values[field];
    const defaultValue = defaultSettings[section][field];

    if (typeof defaultValue === "boolean") {
      if (typeof value !== "boolean") {
        const error = new Error(
          `${field} must be true or false`
        );
        error.status = 400;
        throw error;
      }

      updates[field] = value;
    } else {
      if (typeof value !== "string") {
        const error = new Error(
          `${field} must be text`
        );
        error.status = 400;
        throw error;
      }

      updates[field] = value.trim();
    }
  }

  if (section === "platform") {
    if (
      updates.platformName !== undefined &&
      updates.platformName.length < 2
    ) {
      const error = new Error(
        "Platform name must contain at least 2 characters"
      );
      error.status = 400;
      throw error;
    }

    for (const field of [
      "contactEmail",
      "supportEmail",
    ]) {
      if (
        updates[field] &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          updates[field]
        )
      ) {
        const error = new Error(
          `Please provide a valid ${field}`
        );
        error.status = 400;
        throw error;
      }
    }

    if (
      updates.supportPhone &&
      updates.supportPhone.length > 30
    ) {
      const error = new Error(
        "Support phone number is too long"
      );
      error.status = 400;
      throw error;
    }
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error(
      `No valid ${section} settings were provided`
    );
    error.status = 400;
    throw error;
  }

  return updates;
};

router.get("/", async (req, res) => {
  try {
    const data = await getSettingsData(req);

    return res.status(200).json({
      success: true,
      message: "Admin settings retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get admin settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve admin settings",
    });
  }
});

router.patch("/", async (req, res) => {
  try {
    const body = req.body || {};
    const sections = ["platform", "notifications"];
    const updates = {};

    for (const section of sections) {
      if (body[section] === undefined) continue;

      if (
        !body[section] ||
        typeof body[section] !== "object" ||
        Array.isArray(body[section])
      ) {
        return res.status(400).json({
          success: false,
          message: `${section} settings must be an object`,
        });
      }

      updates[section] = validateSection(
        section,
        body[section]
      );
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid settings were provided",
      });
    }

    const setFields = {
      updatedAt: new Date(),
    };

    for (const [section, fields] of Object.entries(
      updates
    )) {
      for (const [field, value] of Object.entries(
        fields
      )) {
        setFields[`${section}.${field}`] = value;
      }
    }

    await getSettingsCollection().updateOne(
      { _id: SETTINGS_ID },
      { $set: setFields },
      { upsert: true }
    );

    const data = await getSettingsData(req);

    return res.status(200).json({
      success: true,
      message: "Admin settings saved successfully",
      data,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message:
        error.message || "Failed to save admin settings",
    });
  }
});

router.patch("/password", async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body || {};

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "All password fields are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "New password must contain at least 8 characters",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password and confirmation do not match",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from your current password",
      });
    }

    const adminId = getAdminId(req);

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Invalid administrator account",
      });
    }

    const users = getUsersCollection();

    const admin = await users.findOne({
      _id: adminId,
      role: "admin",
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Administrator account not found",
      });
    }

    const passwordField = [
      "password",
      "passwordHash",
      "hashedPassword",
    ].find(
      (field) =>
        typeof admin[field] === "string" &&
        admin[field].length > 0
    );

    if (!passwordField) {
      return res.status(400).json({
        success: false,
        message:
          "This administrator account does not have a password login configured",
      });
    }

    const isCurrentPasswordValid =
      await bcrypt.compare(
        currentPassword,
        admin[passwordField]
      );

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const now = new Date();

    const hashedPassword = await bcrypt.hash(
      newPassword,
      12
    );

    await users.updateOne(
      { _id: adminId, role: "admin" },
      {
        $set: {
          [passwordField]: hashedPassword,
          passwordUpdatedAt: now,
          updatedAt: now,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      data: {
        passwordUpdatedAt: now,
      },
    });
  } catch (error) {
    console.error(
      "Admin password update error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update password",
    });
  }
});

module.exports = router;
