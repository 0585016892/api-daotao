const express = require("express");
const router = express.Router();
const db = require("../mysql/db");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { log } = require("console");

// ===============================
// 📌 Helper: Sinh mã chuẩn
// ===============================
// Hàm tạo mã chứng chỉ ngẫu nhiên hoặc theo logic riêng
const generateCertificateCode = (courseId, studentId) => {
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CERT-${courseId}-${studentId}-${randomStr}`;
};
router.post("/generate/:enrollment_id", async (req, res) => {
  try {
    const enrollment_id = req.params.enrollment_id;

    if (!enrollment_id) {
      return res.status(400).json({ message: "Thiếu enrollment_id" });
    }

    // ===============================
    // 1️⃣ LẤY DỮ LIỆU ENROLLMENT
    // ===============================
    const [enrollment] = await db.promise().query(
      `SELECT 
          e.status,
          s.id AS student_id,
          s.full_name,
          c.id AS course_id,
          c.course_name
       FROM enrollments e
       JOIN students s ON e.student_id = s.id
       JOIN courses c ON e.course_id = c.id
       WHERE e.id = ?`,
      [enrollment_id]
    );

    if (enrollment.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });
    }

    const data = enrollment[0];

    if (data.status !== "Hoàn thành") {
      return res.status(400).json({
        message: "Học viên chưa hoàn thành khóa học",
      });
    }

    // ===============================
    // 2️⃣ CHECK ĐÃ CẤP CHƯA
    // ===============================
    const [exist] = await db.promise().query(
      `SELECT certificate_code 
       FROM certificates 
       WHERE student_id = ? AND course_id = ?`,
      [data.student_id, data.course_id]
    );

    if (exist.length > 0) {
      return res.status(400).json({
        message: "Chứng chỉ đã được cấp trước đó",
        certificate_code: exist[0].certificate_code,
      });
    }

    // ===============================
    // 3️⃣ TẠO MÃ + QR
    // ===============================
    const certCode = `DTM-${data.course_id}-${data.student_id}-${Date.now()
      .toString()
      .slice(-4)}`;

    const verifyLink = `${process.env.WEB_URL}/verify/${certCode}`;

    const qrBuffer = await QRCode.toBuffer(verifyLink, {
      margin: 1,
      color: { dark: "#1a237e" },
    });

    // ===============================
    // 4️⃣ TẠO FOLDER NẾU CHƯA CÓ
    // ===============================
    const dir = path.join(__dirname, "../uploads/certificates");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fileName = `${certCode}.pdf`;
    const filePath = path.join(dir, fileName);

    // ===============================
    // 5️⃣ TẠO PDF
    // ===============================
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
    });

    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    const fontRegular = path.join(__dirname, "../fonts/BeVietnamPro-Regular.ttf");
    const fontBold = path.join(__dirname, "../fonts/BeVietnamPro-Bold.ttf");
    const fontItalic = path.join(__dirname, "../fonts/BeVietnamPro-Italic.ttf");

    const W = doc.page.width;

    // ==== NỀN KHUNG ====
    doc.rect(20, 20, W - 40, doc.page.height - 40)
      .lineWidth(3)
      .stroke("#1a237e");

    doc.rect(28, 28, W - 56, doc.page.height - 56)
      .lineWidth(1)
      .stroke("#c5a059");

    // ==== HEADER ====
    doc.font(fontBold).fillColor("#1a237e").fontSize(18)
      .text("HỆ THỐNG ĐÀO TẠO KỸ NĂNG SỐ", 0, 60, { align: "center" });

    doc.fontSize(28).fillColor("#b71c1c")
      .text("ĐỨC THẮNG MEDIA", 0, 85, { align: "center" });

    // ==== TIÊU ĐỀ ====
    doc.font(fontBold).fillColor("#1a237e").fontSize(40)
      .text("CHỨNG NHẬN HOÀN THÀNH", 0, 160, { align: "center" });

    // ==== NỘI DUNG ====
    doc.font(fontItalic).fillColor("#444").fontSize(16)
      .text("Trân trọng trao tặng cho:", 0, 250, { align: "center" });

    doc.font(fontBold).fillColor("#1a237e").fontSize(45)
      .text(data.full_name.toUpperCase(), 0, 285, { align: "center" });

    doc.font(fontRegular).fillColor("#444").fontSize(16)
      .text("Đã hoàn thành khóa học:", 0, 350, { align: "center" });

    doc.font(fontBold).fillColor("#b71c1c").fontSize(22)
      .text(`[ ${data.course_name.toUpperCase()} ]`, 0, 380, { align: "center" });

    // ==== FOOTER ====
    const footerY = 440;

    doc.image(qrBuffer, 80, footerY, { width: 80 });

    doc.font(fontRegular).fillColor("#777").fontSize(9)
      .text(`Mã số: ${certCode}`, 80, footerY + 85);

    doc.font(fontRegular).fillColor("#000").fontSize(12)
      .text(
        "Ngày cấp: " + new Date().toLocaleDateString("vi-VN"),
        W - 300,
        footerY,
        { width: 250, align: "center" }
      );

    doc.font(fontBold).fillColor("#333").fontSize(16)
      .text("NGUYỄN ĐỨC THẮNG", W - 300, footerY + 90, {
        width: 250,
        align: "center",
      });

    doc.end();

    // ===============================
    // 6️⃣ CHỜ PDF GHI XONG → LƯU DB
    // ===============================
    stream.on("finish", async () => {
      try {
        await db.promise().query(
          `INSERT INTO certificates
           (certificate_code, student_id, course_id, issue_date, qr_data, file_path)
           VALUES (?, ?, ?, CURDATE(), ?, ?)`,
          [certCode, data.student_id, data.course_id, verifyLink, fileName]
        );

        return res.json({
          message: "Cấp chứng chỉ thành công",
          certificate_code: certCode,
          file: fileName,
        });

      } catch (err) {
        console.error("Lỗi lưu DB:", err);

        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({
            message: "Chứng chỉ đã tồn tại",
          });
        }

        return res.status(500).json({
          message: "Lỗi lưu chứng chỉ",
        });
      }
    });

    stream.on("error", (err) => {
      console.error("Lỗi ghi file PDF:", err);
      return res.status(500).json({
        message: "Lỗi tạo file PDF",
      });
    });

  } catch (error) {
    console.error("🔥 Lỗi generate certificate:", error);
    return res.status(500).json({
      message: "Lỗi hệ thống",
    });
  }
});
// router.post("/generate/:enrollment_id", async (req, res) => {
//   try {
//     const enrollment_id = req.params.enrollment_id;

//     // 1. Lấy dữ liệu (Giữ nguyên logic của bạn)
//     const [enrollment] = await db.promise().query(
//       `SELECT e.status, s.id AS student_id, s.full_name, c.id AS course_id, c.course_name
//        FROM enrollments e
//        JOIN students s ON e.student_id = s.id
//        JOIN courses c ON e.course_id = c.id
//        WHERE e.id = ?`, [enrollment_id]
//     );

//     if (enrollment.length === 0) return res.status(404).json({ message: "Không tìm thấy dữ liệu" });
//     const data = enrollment[0];
//     if (data.status !== "Hoàn thành") return res.status(400).json({ message: "Chưa hoàn thành khóa học" });
//     // ===== 0. CHECK ĐÃ CẤP CHƯA =====
//         const [exist] = await db.promise().query(
//         `SELECT id, certificate_code 
//         FROM certificates 
//         WHERE student_id = ? AND course_id = ?`,
//         [data.student_id, data.course_id]
//         );

//         if (exist.length > 0) {
//         return res.status(400).json({
//             message: "Học viên đã được cấp chứng chỉ trước đó",
//             certificate_code: exist[0].certificate_code
//         });
//         }

//     // 2. Tạo mã và QR
//     const certCode = `DTM-${data.course_id}-${data.student_id}-${Date.now().toString().slice(-4)}`;
//     const verifyLink = `${process.env.WEB_URL}/verify/${certCode}`;
//     const qrBuffer = await QRCode.toBuffer(verifyLink, { margin: 1, color: { dark: "#1a237e" } });

//     const fileName = `${certCode}.pdf`;
//     const filePath = path.join(__dirname, "../uploads/certificates", fileName);

//     // 3. Khởi tạo PDF - Tắt autoFirstPage để kiểm soát hoàn toàn hoặc giữ nguyên nhưng margin 0
//     const doc = new PDFDocument({ 
//         size: "A4", 
//         layout: "landscape", 
//         margin: 0,
//         bufferPages: true // Giúp kiểm soát trang tốt hơn
//     });
//     const stream = fs.createWriteStream(filePath);
//     doc.pipe(stream);

//     const fontRegular = path.join(__dirname, "../fonts/BeVietnamPro-Regular.ttf");
//     const fontBold = path.join(__dirname, "../fonts/BeVietnamPro-Bold.ttf");
//     const fontItalic = path.join(__dirname, "../fonts/BeVietnamPro-Italic.ttf");

//     const W = doc.page.width;
//     const H = doc.page.height;

//     // --- 1. NỀN & KHUNG (Chỉ vẽ trên 1 trang) ---
//     doc.rect(20, 20, W - 40, H - 40).lineWidth(3).stroke("#1a237e");
//     doc.rect(28, 28, W - 56, H - 56).lineWidth(1).stroke("#c5a059");

//     // --- 2. HEADER ---
//     doc.font(fontBold).fillColor("#1a237e").fontSize(18)
//        .text("HỆ THỐNG ĐÀO TẠO KỸ NĂNG SỐ", 0, 60, { align: "center" });
    
//     doc.fontSize(28).fillColor("#b71c1c")
//        .text("ĐỨC THẮNG MEDIA", 0, 85, { align: "center", characterSpacing: 2 });
    
//     doc.moveTo(W/2 - 80, 120).lineTo(W/2 + 80, 120).lineWidth(1.5).stroke("#c5a059");

//     // --- 3. TIÊU ĐỀ CHỨNG NHẬN ---
//     doc.font(fontBold).fillColor("#1a237e").fontSize(40)
//        .text("CHỨNG NHẬN HOÀN THÀNH", 0, 160, { align: "center" });
    
//     doc.font(fontRegular).fillColor("#c5a059").fontSize(14)
//        .text("CERTIFICATE OF COMPLETION", 0, 205, { align: "center", characterSpacing: 4 });

//     // --- 4. NỘI DUNG ---
//     doc.font(fontItalic).fillColor("#444").fontSize(16)
//        .text("Hệ thống ĐỨC THẮNG MEDIA trân trọng trao tặng cho:", 0, 250, { align: "center" });

//     doc.font(fontBold).fillColor("#1a237e").fontSize(45)
//        .text(data.full_name.toUpperCase(), 0, 285, { align: "center" });

//     doc.font(fontRegular).fillColor("#444").fontSize(16)
//        .text("Vì đã hoàn thành xuất sắc khóa học chuyên môn:", 0, 350, { align: "center" });

//     doc.font(fontBold).fillColor("#b71c1c").fontSize(22)
//        .text(`[ ${data.course_name.toUpperCase()} ]`, 0, 380, { align: "center" });

//     // --- 5. CHÂN TRANG (FOOTER) ---
//     const footerY = 440;

//     // Bên trái: QR Code
//     doc.image(qrBuffer, 80, footerY, { width: 80 });
//     doc.font(fontRegular).fillColor("#777").fontSize(9)
//        .text(`Mã số: ${certCode}`, 80, footerY + 85)
//        .text(`Tra cứu: ducthangmedia.com/verify`, 80, footerY + 97);

//     // Bên phải: Chữ ký
//     const signX = W - 300;
//     doc.font(fontRegular).fillColor("#000").fontSize(12)
//        .text("Hà Nội, ngày cấp: " + new Date().toLocaleDateString("vi-VN"), signX, footerY, { width: 250, align: "center" });
    
//     doc.font(fontBold).fillColor("#1a237e").fontSize(14)
//        .text("GIÁM ĐỐC TRUNG TÂM", signX, footerY + 20, { width: 250, align: "center" });

//     // Vị trí ký tên (Cách ra một khoảng cho con dấu/chữ ký tay)
//     doc.font(fontBold).fillColor("#333").fontSize(16)
//        .text("NGUYỄN ĐỨC THẮNG", signX, footerY + 90, { width: 250, align: "center" });

//     // --- QUAN TRỌNG: KẾT THÚC ---
//     doc.end();

//     stream.on("finish", async () => {
//   try {
//     await db.promise().query(
//       `INSERT INTO certificates 
//        (certificate_code, student_id, course_id, issue_date, qr_data, file_path) 
//        VALUES (?, ?, ?, CURDATE(), ?, ?)`,
//       [certCode, data.student_id, data.course_id, verifyLink, fileName]
//     );

//     return res.json({
//       message: "Cấp chứng chỉ thành công!",
//       file: fileName,
//       certificate_code: certCode
//     });

//   } catch (err) {
//     if (err.code === "ER_DUP_ENTRY") {
//       return res.status(400).json({
//         message: "Chứng chỉ đã tồn tại (trùng dữ liệu)"
//       });
//     }

//     console.error("Lỗi insert DB:", err);
//     return res.status(500).json({ message: "Lỗi lưu chứng chỉ" });
//   }
// });

//   } catch (error) {
//     console.error(error);
//     res.status(400).send("Lỗi hệ thống");
//   }
// })

// ===============================
// 📌 2️⃣ DOWNLOAD PDF
// GET /api/certificates/download/:code
// ===============================
router.get("/download/:code", (req, res) => {
  const code = req.params.code;

  db.query(
    "SELECT file_path FROM certificates WHERE certificate_code=?",
    [code],
    (err, rows) => {
      if (rows.length === 0)
        return res.status(404).json({ message: "Không tồn tại" });

      const filePath = path.join(
        __dirname,
        "../uploads/certificates",
        rows[0].file_path
      );

      res.download(filePath);
    }
  );
});
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const keyword = req.query.keyword || "";
    const course_id = req.query.course_id || "";
    const from_date = req.query.from_date || "";
    const to_date = req.query.to_date || "";
    const sort = req.query.sort || "newest";

    let where = "WHERE 1=1";
    let params = [];

    // ===== SEARCH =====
    if (keyword) {
      where += `
        AND (
          s.full_name LIKE ?
          OR c.course_name LIKE ?
          OR cert.certificate_code LIKE ?
        )
      `;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // ===== FILTER COURSE =====
    if (course_id) {
      where += " AND cert.course_id = ?";
      params.push(course_id);
    }

    // ===== FILTER DATE =====
    if (from_date && to_date) {
      where += " AND cert.issue_date BETWEEN ? AND ?";
      params.push(from_date, to_date);
    }

    // ===== SORT =====
    const orderBy =
      sort === "oldest"
        ? "ORDER BY cert.issue_date ASC"
        : "ORDER BY cert.issue_date DESC";

    // =========================================
    // 🔥 COUNT DISTINCT (Không trùng student + course)
    // =========================================
    const [countResult] = await db.promise().query(
      `
      SELECT COUNT(*) as total FROM (
        SELECT cert.student_id, cert.course_id
        FROM certificates cert
        JOIN students s ON cert.student_id = s.id
        JOIN courses c ON cert.course_id = c.id
        ${where}
        GROUP BY cert.student_id, cert.course_id
      ) as grouped
      `,
      params
    );

    const total = countResult[0].total;

    // =========================================
    // 🔥 THỐNG KÊ TỔNG
    // =========================================
    const [stats] = await db.promise().query(`
      SELECT 
        COUNT(*) as total_certificates,
        COUNT(DISTINCT student_id) as total_students,
        COUNT(DISTINCT course_id) as total_courses
      FROM certificates
    `);

    // =========================================
    // 🔥 DATA (Lấy mới nhất mỗi student/course)
    // =========================================
    const [data] = await db.promise().query(
      `
      SELECT 
        cert.id,
        cert.certificate_code,
        cert.issue_date,
        cert.file_path,
        s.full_name,
        c.course_name,
        c.id as course_id
      FROM certificates cert
      JOIN students s ON cert.student_id = s.id
      JOIN courses c ON cert.course_id = c.id
      INNER JOIN (
          SELECT student_id, course_id, MAX(issue_date) as max_date
          FROM certificates
          GROUP BY student_id, course_id
      ) grouped
      ON cert.student_id = grouped.student_id
      AND cert.course_id = grouped.course_id
      AND cert.issue_date = grouped.max_date
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    res.json({
      stats: stats[0],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data,
    });

  } catch (error) {
    console.error("🔥 LỖI LẤY CHỨNG CHỈ:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
router.get("/student/:student_id", async (req, res) => {
  try {
    const student_id = req.params.student_id;

    const [data] = await db.promise().query(
      `
      SELECT 
        cert.id,
        cert.certificate_code,
        cert.issue_date,
        cert.file_path,
        c.course_name
      FROM certificates cert
      JOIN courses c ON cert.course_id = c.id
      WHERE cert.student_id = ?
      ORDER BY cert.issue_date DESC
      `,
      [student_id]
    );

    res.json(data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
// router.get("/download/:fileName", (req, res) => {
//   const filePath = path.join(
//     __dirname,
//     "../uploads/certificates",
//     req.params.fileName
//   );

//   if (!fs.existsSync(filePath)) {
//     return res.status(404).json({ message: "Không tìm thấy file" });
//   }

//   res.download(filePath);
// });
// ===============================
// 📌 3️⃣ VERIFY
// GET /api/certificates/verify/:code
// ===============================
router.get("/verify/:code", (req, res) => {
  const code = req.params.code;

  const sql = `
    SELECT c.*, s.full_name, co.course_name
    FROM certificates c
    JOIN students s ON c.student_id = s.id
    JOIN courses co ON c.course_id = co.id
    WHERE certificate_code = ?
  `;

  db.query(sql, [code], (err, result) => {
    if (result.length === 0)
      return res.status(404).json({ message: "Chứng chỉ không hợp lệ" });

    res.json(result[0]);
  });
});
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Kiểm tra chứng chỉ tồn tại
    const [rows] = await db.promise().query(
      "SELECT * FROM certificates WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Chứng chỉ không tồn tại",
      });
    }

    const certificate = rows[0];

    // 2️⃣ Xóa file nếu có
    if (certificate.file_path) {
      const filePath = path.join(__dirname, "../uploads/certificates", certificate.file_path);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // 3️⃣ Xóa trong database
    await db.promise().query(
      "DELETE FROM certificates WHERE id = ?",
      [id]
    );

    res.json({
      message: "Xóa chứng chỉ thành công",
    });

  } catch (error) {
    console.error("🔥 LỖI XÓA CHỨNG CHỈ:", error);
    res.status(500).json({
      message: "Lỗi server",
    });
  }
});

module.exports = router;    