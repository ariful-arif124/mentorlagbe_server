
require("dotenv").config();

const bcrypt = require("bcryptjs");

const { connectDB } = require("./src/config/db");

const {
  ensureUserIndexes,
  findUserByEmail,
  createUser,
} = require("./src/models/userModel");

async function createAdmin() {
  try {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    // Validate environment variables
    if (!name || !email || !password) {
      throw new Error(
        "ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required."
      );
    }

    if (password.length < 16) {
      throw new Error(
        "Admin password must contain at least 16 characters."
      );
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      throw new Error(
        "Admin password must not exceed 72 UTF-8 bytes."
      );
    }

    // Connect to MongoDB
    await connectDB();

    // Ensure unique email index
    await ensureUserIndexes();

    // Check whether this email already exists
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      if (existingUser.role === "admin") {
        console.log("An admin account with this email already exists.");
        process.exit(0);
      }

      throw new Error(
        "This email already belongs to a non-admin account. No changes were made."
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create administrator
    const result = await createUser({
      name: name.trim(),
      email,
      passwordHash,
      role: "admin",
    });

    console.log("--------------------------------");
    console.log("ADMIN ACCOUNT CREATED SUCCESSFULLY");
    console.log("--------------------------------");
    console.log("Name:", name);
    console.log("Email:", email);
    console.log("Role: admin");
    console.log("User ID:", result.insertedId.toString());
    console.log("--------------------------------");

    process.exit(0);

  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exit(1);
  }
}

createAdmin();
