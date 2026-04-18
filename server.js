const express = require("express");
const path = require("path");
require("dotenv").config();
require("./cron/cleanupOtp");
const cors = require("cors");
const bodyParser = require("body-parser");

const apiRoutes = require("./routes/api");
const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard");
const settingRoutes = require("./routes/settingRoutes");
const chatbotRoutes = require("./routes/chatbot");


const app = express();
const PORT = process.env.PORT || 5000;
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use("/api", apiRoutes);
app.use("/api/user", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/chatbot", chatbotRoutes);


// Test server
app.get("/", (req, res) => {
  res.send("🚀 API Quản lý đào tạo đang chạy");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
