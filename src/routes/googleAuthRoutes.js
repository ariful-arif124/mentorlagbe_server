
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const {
  createUser,
  findUserByEmail,
} = require("../models/userModel");

const router = express.Router();

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

// ==========================================
// GOOGLE AUTHENTICATION
// POST /api/auth/google
// ==========================================

router.post("/", async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        message: "Google authentication is not configured",
      });
    }

    const { credential, role } = req.body || {};

    if (
      typeof credential !== "string" ||
      !credential.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
    }

    // 1. Verify Google ID token

    let ticket;

    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google authentication credential",
      });
    }

    const payload = ticket.getPayload();

    if (
      !payload ||
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      return res.status(401).json({
        success: false,
        message: "Google email verification failed",
      });
    }

    const email = payload.email.trim().toLowerCase();

    const name =
      String(payload.name || email.split("@")[0]).trim();

    // 2. Find existing account

    let user = await findUserByEmail(email);
    let isNewUser = false;

    // 3. Register new Google user

    if (!user) {
      const normalizedRole =
        typeof role === "string"
          ? role.trim().toLowerCase()
          : "";

      if (!normalizedRole) {
        return res.status(404).json({
          success: false,
          code: "ACCOUNT_NOT_FOUND",
          message:
            "No account found. Please sign up with Google first.",
        });
      }

      if (!["student", "tutor"].includes(normalizedRole)) {
        return res.status(400).json({
          success: false,
          message: "Invalid registration role",
        });
      }

      // Generate an inaccessible random password hash.
      // Existing password authentication remains compatible.

      const randomPassword = crypto
        .randomBytes(48)
        .toString("hex");

      const passwordHash = await bcrypt.hash(
        randomPassword,
        10
      );

      try {
        await createUser({
          name,
          email,
          passwordHash,
          role: normalizedRole,
          plan: "free",
          isActive: true,
        });

        user = await findUserByEmail(email);
        isNewUser = true;

      } catch (error) {
        // Handle simultaneous duplicate registrations.

        if (error.code === 11000) {
          user = await findUserByEmail(email);
        } else {
          throw error;
        }
      }
    }

    if (!user) {
      return res.status(500).json({
        success: false,
        message: "Unable to create or retrieve user account",
      });
    }

    // 4. Admin accounts use existing authentication.

    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts must use standard sign-in",
      });
    }

    // 5. Check account status.

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DEACTIVATED",
        message:
          "Your account has been deactivated. Please contact the administrator.",
      });
    }

    // 6. Generate existing MentorLagbe JWT.

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      }
    );

    // 7. Return existing login response structure.

    return res.status(200).json({
      success: true,
      message: isNewUser
        ? "Google registration successful"
        : "Google sign-in successful",

      data: {
        token,

        user: {
          userId: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          plan: user.plan || "free",
        },

        isNewUser,
      },
    });

  } catch (error) {
    console.error("Google authentication error:", error);

    return res.status(500).json({
      success: false,
      message: "Google authentication failed",
    });
  }
});

module.exports = router;
