
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("./src/config/db");
const { ensureUserIndexes } = require("./src/models/userModel");
const { ensurePaymentIndexes } = require("./src/models/paymentModel");

const adminSettingsRoutes = require("./src/routes/adminSettingsRoutes");
const authRoutes = require("./src/routes/authRoutes");
const tutorRoutes = require("./src/routes/tutorRoutes");
const tuitionRoutes = require("./src/routes/tuition.routes");
const adminRoutes = require("./src/routes/adminRoutes");
const applicationRoutes = require("./src/routes/applicationRoutes");
const googleAuthRoutes = require("./src/routes/googleAuthRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const uploadRoutes = require("./src/routes/uploadRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "MentorLagbe API is running!",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/tutor", tutorRoutes);
app.use("/api/tuitions", tuitionRoutes);

app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/applications", applicationRoutes);
app.use("/api/auth/google", googleAuthRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/payments", paymentRoutes);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await ensureUserIndexes();
    await ensurePaymentIndexes();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
