
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("./src/config/db");
const { ensureUserIndexes } = require("./src/models/userModel");

const authRoutes = require("./src/routes/authRoutes");
const tuitionRoutes = require("./src/routes/tuition.routes");

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "MentorLagbe API is running!",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/tuitions", tuitionRoutes);

// Server Configuration
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await ensureUserIndexes();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
