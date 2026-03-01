const express = require("express");
const router = express.Router();
const db = require("../mysql/db"); // Đảm bảo đường dẫn tới file kết nối DB của bạn đúng

// --- 1. LẤY TOÀN BỘ CÀI ĐẶT HỆ THỐNG ---
router.get("/", (req, res) => {
  const sql = "SELECT setting_key, setting_value FROM system_settings";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Lỗi lấy settings:", err);
      return res.status(500).json({ message: "Lỗi server", error: err });
    }

    // Chuyển đổi từ mảng [{setting_key: 'a', setting_value: 'b'}] 
    // sang Object dễ dùng cho Frontend: { a: 'b' }
    const settings = {};
    results.forEach((item) => {
      settings[item.setting_key] = item.setting_value;
    });

    res.json(settings);
  });
});

// --- 2. CẬP NHẬT CÀI ĐẶT HÀNG LOẠT ---
router.post("/update", async (req, res) => {
  const settings = req.body; // Dữ liệu nhận được: { site_name: "...", maintenance_mode: "..." }
  const keys = Object.keys(settings);

  if (keys.length === 0) {
    return res.status(400).json({ message: "Không có dữ liệu để cập nhật" });
  }

  try {
    // Sử dụng vòng lặp để cập nhật từng key
    // Lưu ý: Trong thực tế nếu DB lớn nên dùng transaction, 
    // nhưng với bảng settings nhỏ, cách này đơn giản và hiệu quả.
    const updatePromises = keys.map((key) => {
      return new Promise((resolve, reject) => {
        const sql = "UPDATE system_settings SET setting_value = ? WHERE setting_key = ?";
        // Ép kiểu về String để lưu vào cột TEXT trong DB
        const value = typeof settings[key] === "boolean" ? String(settings[key]) : settings[key];
        
        db.query(sql, [value, key], (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    });

    await Promise.all(updatePromises);
    res.json({ message: "✅ Cập nhật cấu hình hệ thống thành công" });
  } catch (error) {
    console.error("Lỗi cập nhật settings:", error);
    res.status(500).json({ message: "Lỗi khi cập nhật dữ liệu", error });
  }
});

module.exports = router;