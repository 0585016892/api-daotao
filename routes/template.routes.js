const express = require("express");
const router = express.Router();
const db = require("../mysql/db");
const multer = require("multer");
const path = require("path");

// ==============================
// UPLOAD CONFIG
// ==============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/templates/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// ==============================
// GET ALL
// ==============================
router.get("/", async (req, res) => {
  try {
    console.log("📥 GET /templates called");

    const [rows] = await db.promise().query(
      "SELECT * FROM certificate_templates ORDER BY id DESC"
    );

    console.log("📊 Total templates:", rows.length);

    res.json(rows);
  } catch (err) {
    console.error("🔥 GET ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ==============================
// CREATE
// ==============================
router.post(
  "/",
  upload.fields([
    upload.fields([
    { name: "background_image", maxCount: 1 },
    { name: "signature_image", maxCount: 1 },
  ]),
  ]),
  async (req, res) => {
    try {
      console.log("📥 POST /templates called");
      console.log("📦 BODY:", req.body);
      console.log("🖼 FILES:", req.files);

      const {
        template_name,
        organization_name,
        description,
        status
      } = req.body;

      if (!template_name || !organization_name) {
        return res.status(400).json({
          message: "Thiếu template_name hoặc organization_name"
        });
      }

      const bg = req.files?.background_image
        ? req.files.background_image[0].filename
        : null;

      const sign = req.files?.signature_image
        ? req.files.signature_image[0].filename
        : null;

      const fontRegular = req.files?.font_regular
        ? req.files.font_regular[0].filename
        : null;

      const fontBold = req.files?.font_bold
        ? req.files.font_bold[0].filename
        : null;

      const [result] = await db.promise().query(
        `INSERT INTO certificate_templates 
        (template_name, organization_name, background_image, signature_image, font_regular, font_bold, description, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          template_name,
          organization_name,
          bg,
          sign,
          fontRegular,
          fontBold,
          description || null,
          status || "inactive"
        ]
      );

      console.log("✅ Inserted ID:", result.insertId);

      res.json({ message: "Tạo template thành công" });

    } catch (err) {
      console.error("🔥 CREATE ERROR:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
);
// ==============================
// UPDATE
// ==============================
router.put(
  "/:id",
  upload.fields([
    { name: "background_image" },
    { name: "signature_image" }
  ]),
  async (req, res) => {
    try {
      console.log("📥 PUT /templates/" + req.params.id);

      console.log("📦 BODY:", req.body);
      console.log("🖼 FILES:", req.files);

      const { id } = req.params;
      const { template_name, organization_name, description, status } = req.body;

      const bg = req.files?.["background_image"]
        ? req.files["background_image"][0].filename
        : null;

      const sign = req.files?.["signature_image"]
        ? req.files["signature_image"][0].filename
        : null;

      console.log("🖼 New Background:", bg);
      console.log("✍️ New Signature:", sign);

      const [result] = await db.promise().query(
        `UPDATE certificate_templates SET
          template_name=?,
          organization_name=?,
          background_image=COALESCE(?, background_image),
          signature_image=COALESCE(?, signature_image),
          description=?,
          status=?
        WHERE id=?`,
        [template_name, organization_name, bg, sign, description, status, id]
      );

      console.log("✅ Affected rows:", result.affectedRows);

      res.json({ message: "Cập nhật thành công" });

    } catch (err) {
      console.error("🔥 UPDATE ERROR:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
);

// ==============================
// DELETE
// ==============================
router.delete("/:id", async (req, res) => {
  try {
    console.log("📥 DELETE /templates/" + req.params.id);

    const [result] = await db.promise().query(
      "DELETE FROM certificate_templates WHERE id=?",
      [req.params.id]
    );

    console.log("🗑 Deleted rows:", result.affectedRows);

    res.json({ message: "Xóa thành công" });

  } catch (err) {
    console.error("🔥 DELETE ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;