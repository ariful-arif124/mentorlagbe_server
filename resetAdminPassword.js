
require("dotenv").config();

const bcrypt = require("bcryptjs");
const { connectDB, getDB } = require("./src/config/db");

async function resetAdminPassword() {
  try {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_NEW_PASSWORD;

    if (!email || !password) {
      throw new Error("Admin email and new password are required.");
    }

    if (password.length < 16 || Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("Password must be at least 16 characters and no more than 72 UTF-8 bytes.");
    }

    await connectDB();

    const users = getDB().collection("users");

    const admin = await users.findOne({
      email,
      role: "admin",
    });

    if (!admin) {
      throw new Error("Admin account not found.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await users.updateOne(
      { _id: admin._id, role: "admin" },
      {
        $set: {
          passwordHash,
          updatedAt: new Date(),
        },
      }
    );

    console.log("Admin password reset successfully!");
    console.log("Admin email:", email);

    process.exit(0);
  } catch (error) {
    console.error("Password reset failed:", error.message);
    process.exit(1);
  }
}

resetAdminPassword();
