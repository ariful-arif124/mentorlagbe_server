
const express = require("express");
const multer = require("multer");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// CONFIGURATION
// ==========================================

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error("Only JPG, PNG and WebP images are allowed.")
      );
    }

    callback(null, true);
  },
});

// ==========================================
// FILE SIGNATURE VALIDATION
// ==========================================

const isValidImage = (file) => {
  const buffer = file.buffer;

  if (file.mimetype === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (file.mimetype === "image/png") {
    return buffer
      .subarray(0, 8)
      .equals(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47,
          0x0d, 0x0a, 0x1a, 0x0a,
        ])
      );
  }

  if (file.mimetype === "image/webp") {
    return (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
};

// ==========================================
// MULTER ERROR HANDLER
// ==========================================

const handleUpload = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "Image size must not exceed 5 MB.",
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next();
  });
};

// ==========================================
// POST PROFILE IMAGE
// POST /api/upload/profile-image
// ==========================================

router.post(
  "/profile-image",
  verifyToken,
  handleUpload,
  async (req, res) => {
    try {
      // Check API configuration

      const apiKey = process.env.IMGBB_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message: "Image upload service is not configured.",
        });
      }

      // Check uploaded file

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select an image.",
        });
      }

      // Validate actual image signature

      if (!isValidImage(req.file)) {
        return res.status(400).json({
          success: false,
          message: "Invalid image file.",
        });
      }

      // Prepare ImgBB request

      const formData = new FormData();

      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[req.file.mimetype];

      const imageBlob = new Blob(
        [req.file.buffer],
        { type: req.file.mimetype }
      );

      formData.append(
        "image",
        imageBlob,
        `profile-image.${extension}`
      );

      // Upload to ImgBB

      const imgbbResponse = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const imgbbResult = await imgbbResponse
        .json()
        .catch(() => null);

      if (
        !imgbbResponse.ok ||
        !imgbbResult?.success ||
        !imgbbResult?.data?.url
      ) {
        console.error(
          "ImgBB error:",
          imgbbResult?.error?.message ||
            imgbbResponse.statusText
        );

        return res.status(502).json({
          success: false,
          message: "Unable to upload image to ImgBB.",
        });
      }

      const imageUrl = imgbbResult.data.url;

      // Save image URL to logged-in user's MongoDB account

      if (!ObjectId.isValid(req.user.userId)) {
        return res.status(401).json({
          success: false,
          message: "Invalid user account.",
        });
      }

      const db = getDB();

      const updateResult = await db
        .collection("users")
        .updateOne(
          {
            _id: new ObjectId(req.user.userId),
          },
          {
            $set: {
              image: imageUrl,
              updatedAt: new Date(),
            },
          }
        );

      if (updateResult.matchedCount !== 1) {
        return res.status(404).json({
          success: false,
          message: "User account not found.",
        });
      }

      // Success response

      return res.status(200).json({
        success: true,
        message: "Profile picture uploaded successfully.",

        data: {
          image: imageUrl,
        },
      });

    } catch (error) {
      console.error("Profile image upload error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to upload profile picture.",
      });
    }
  }
);

module.exports = router;
