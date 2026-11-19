
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

async function verifyToken(req, res, next) {
  let decoded;

  // Step 1: Verify JWT
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required",
      });
    }

    const token = authHeader.split(" ")[1];

    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

  // Step 2: Verify user from database
  try {
    if (!ObjectId.isValid(decoded.userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid user account",
      });
    }

    const db = getDB();

    const user = await db.collection("users").findOne({
      _id: new ObjectId(decoded.userId),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found",
      });
    }

    // Step 3: Block deactivated accounts
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated",
      });
    }

    // Step 4: Attach current database user information
    req.user = {
      ...decoded,
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
    };

    next();

  } catch (error) {
    console.error("Authentication middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify account status",
    });
  }
}

function verifyTutor(req, res, next) {
  if (!req.user || req.user.role !== "tutor") {
    return res.status(403).json({
      success: false,
      message: "Tutor access required",
    });
  }

  next();
}

function verifyAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
}

module.exports = {
  verifyToken,
  verifyTutor,
  verifyAdmin,
};
