
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken);

// Format safe profile response
const formatProfile = (user) => ({
  userId: user._id.toString(),
  name: user.name || "",
  email: user.email || "",
  role: user.role || "",
  plan: user.plan || "free",
  image: user.image || "",
  phone: user.phone || "",
  bio: user.bio || "",
  createdAt: user.createdAt || null,
});

// ==========================================
// GET CURRENT USER PROFILE
// GET /api/profile
// ==========================================

router.get("/", async (req, res) => {
  try {
    const userId = new ObjectId(req.user.userId);

    const user = await getDB()
      .collection("users")
      .findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data: formatProfile(user),
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve profile",
    });
  }
});

// ==========================================
// UPDATE CURRENT USER PROFILE
// PATCH /api/profile
// ==========================================

router.patch("/", async (req, res) => {
  try {
    const { name, phone, bio, image } = req.body || {};

    const updates = {};

    // Name validation
    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 60
      ) {
        return res.status(400).json({
          success: false,
          message: "Name must contain 2-60 characters",
        });
      }

      updates.name = name.trim();
    }

    // Phone validation
    if (phone !== undefined) {
      if (
        typeof phone !== "string" ||
        phone.trim().length > 25
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number",
        });
      }

      const normalizedPhone = phone.trim();
      const digits = normalizedPhone.replace(/\D/g, "");

      if (
        normalizedPhone &&
        (digits.length < 7 || digits.length > 15)
      ) {
        return res.status(400).json({
          success: false,
          message: "Phone number must contain 7-15 digits",
        });
      }

      updates.phone = normalizedPhone;
    }

    // Bio validation
    if (bio !== undefined) {
      if (
        typeof bio !== "string" ||
        bio.trim().length > 500
      ) {
        return res.status(400).json({
          success: false,
          message: "Bio cannot exceed 500 characters",
        });
      }

      updates.bio = bio.trim();
    }

    // Profile image URL validation
    if (image !== undefined) {
      if (
        typeof image !== "string" ||
        image.length > 1000
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid profile image URL",
        });
      }

      const normalizedImage = image.trim();

      if (normalizedImage) {
        try {
          const parsedUrl = new URL(normalizedImage);

          if (
            !["http:", "https:"].includes(parsedUrl.protocol)
          ) {
            throw new Error("Invalid image URL");
          }
        } catch {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid image URL",
          });
        }
      }

      updates.image = normalizedImage;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No profile information provided",
      });
    }

    updates.updatedAt = new Date();

    const userId = new ObjectId(req.user.userId);
    const usersCollection = getDB().collection("users");

    const result = await usersCollection.updateOne(
      { _id: userId },
      { $set: updates }
    );

    if (result.matchedCount !== 1) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const updatedUser = await usersCollection.findOne({
      _id: userId,
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: formatProfile(updatedUser),
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
});

module.exports = router;
