const express = require("express");
const router = express.Router();
const db = require("../mysql/db");
const upload = require("../middleware/uploadTeacher");

// =======================
// 📌 1. LẤY DANH SÁCH
// =======================
router.get("/", async (req, res) => {
  try {
    const rows = await db.queryAsync(
      "SELECT * FROM teachers ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// =======================
// 📌 2. LẤY CHI TIẾT
// =======================
router.get("/:id", async (req, res) => {
  try {
    const rows = await db.queryAsync(
      "SELECT * FROM teachers WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Không tìm thấy" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// =======================
// 📌 3. THÊM GIÁO VIÊN (UPLOAD AVATAR)
// =======================
router.post("/", upload.single("avatar"), async (req, res) => {
  try {
    const { full_name, email, phone, address, status } = req.body;

    const avatar = req.file
      ? `/uploads/teachers/${req.file.filename}`
      : null;

    const result = await db.queryAsync(
      `INSERT INTO teachers 
      (full_name, email, phone, address, avatar, status)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        full_name,
        email,
        phone,
        address,
        avatar,
        status ?? 1,
      ]
    );

    res.json({
      message: "Thêm giáo viên thành công",
      id: result.insertId,
      avatar,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err });
  }
});


// =======================
// 📌 4. UPDATE (CÓ UPLOAD AVATAR)
// =======================
router.put("/:id", upload.single("avatar"), async (req, res) => {
  try {
    const { full_name, email, phone, address, status } = req.body;

    let avatar = req.body.avatar; // fallback cũ

    if (req.file) {
      avatar = `/uploads/teachers/${req.file.filename}`;
    }

    await db.queryAsync(
      `UPDATE teachers SET 
        full_name = ?, 
        email = ?, 
        phone = ?, 
        address = ?, 
        avatar = ?, 
        status = ?
      WHERE id = ?`,
      [
        full_name,
        email,
        phone,
        address,
        avatar,
        status,
        req.params.id,
      ]
    );

    res.json({ message: "Cập nhật thành công" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err });
  }
});


// =======================
// 📌 5. DELETE
// =======================
router.delete("/:id", async (req, res) => {
  try {
    await db.queryAsync(
      "DELETE FROM teachers WHERE id = ?",
      [req.params.id]
    );

    res.json({ message: "Xóa thành công" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;