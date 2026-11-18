
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
  createUser,
  findUserByEmail,
} = require("../models/userModel");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and role are required",
      });
    }

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof role !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid input format",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRole = role.trim().toLowerCase();

    if (normalizedName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must contain at least 2 characters",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    if (!["student", "tutor"].includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role must be student or tutor",
      });
    }

    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await createUser({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role: normalizedRole,
      plan: "free",
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: {
        userId: result.insertedId.toString(),
        name: normalizedName,
        email: normalizedEmail,
        role: normalizedRole,
        plan: "free",
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid input format",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DEACTIVATED",
        message:
          "Your account has been deactivated. Please contact the administrator.",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in .env");
    }

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

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          userId: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          plan: user.plan || "free",
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

module.exports = router;
