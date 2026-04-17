const express = require("express");
const router = express.Router();
const db = require("../mysql/db");
const uploadCourseImage = require("../middleware/upload.js");
const nodemailer = require("nodemailer");

// 1. Cấu hình transporter (Dùng Gmail làm ví dụ)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Email gửi đi
    pass: process.env.GMAIL_PASS, // Mật khẩu ứng dụng (App Password)
  },
});
/* =========================
   HỌC VIÊN
========================= */

// Lấy danh sách học viên
router.get("/students", (req, res) => {
  console.log('gọi ok');
  
  // 1. Lấy và ép kiểu các tham số
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 6);
  const offset = (page - 1) * limit;
  const { keyword = "", gender = "" } = req.query;

  let where = "WHERE 1=1";
  let params = [];

  // 2. Xây dựng điều kiện tìm kiếm đa năng
  if (keyword) {
    where += ` AND (full_name LIKE ? OR student_code LIKE ? OR phone LIKE ? OR email LIKE ?)`;
    const search = `%${keyword}%`;
    params.push(search, search, search, search);
  }

  if (gender) {
    where += " AND gender = ?";
    params.push(gender);
  }

  // 3. Query đếm tổng số bản ghi (phục vụ phân trang FE)
  const sqlCount = `SELECT COUNT(*) AS total FROM students ${where}`;
  db.query(sqlCount, params, (err, countResult) => {
    if (err) return res.status(500).json(err);
    const total = countResult[0].total;

    // 4. Query lấy dữ liệu thực tế
    const sqlData = `SELECT * FROM students ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
    db.query(sqlData, [...params, limit, offset], (err, results) => {
      if (err) return res.status(500).json(err);
      res.json({
        page,
        limit,
        total,
        data: results
      });
    });
  });
});

// Thêm học viên
router.post("/students", (req, res) => {
  const { student_code, full_name, gender, phone, email, address ,date_of_birth} = req.body;
    
  const sql = `
    INSERT INTO students (student_code, full_name, gender, phone, email, address,date_of_birth)
    VALUES (?, ?, ?, ?, ?, ?,?)
  `;

  db.query(
    sql,
    [student_code, full_name, gender, phone, email, address ,date_of_birth],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Thêm học viên thành công" });
    }
  );
});

// Xóa học viên
router.delete("/students/:id", (req, res) => {
  db.query("DELETE FROM students WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "🗑️ Xóa học viên thành công" });
  });
});
// Cập nhật học viên
router.put("/students/:id", (req, res) => {
  const studentId = req.params.id;
  const data = req.body;

  // 1. Lọc ra các trường có giá trị (không undefined)
  const fields = [];
  const values = [];

  // Danh sách các cột cho phép cập nhật
  const allowedColumns = [
    "student_code", 
    "full_name", 
    "gender", 
    "phone", 
    "email", 
    "address", 
    "date_of_birth"
  ];

  allowedColumns.forEach((col) => {
    // Chỉ thêm vào câu lệnh SQL nếu trường đó tồn tại trong req.body
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(data[col]);
    }
  });

  // 2. Kiểm tra nếu không có trường nào để cập nhật
  if (fields.length === 0) {
    return res.status(400).json({ message: "Không có thông tin nào để thay đổi" });
  }

  // 3. Thêm ID vào cuối mảng giá trị cho điều kiện WHERE
  values.push(studentId);

  // 4. Tạo câu lệnh SQL động
  const sql = `UPDATE students SET ${fields.join(", ")} WHERE id = ?`;

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Update error:", err);
      return res.status(500).json({ message: "Lỗi hệ thống", error: err });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy học viên" });
    }

    res.json({ message: "Cập nhật học viên thành công" });
  });
});
// Tìm kiếm học viên
router.get("/students/search", (req, res) => {
  const keyword = `%${req.query.q || ""}%`;

  const sql = `
    SELECT * FROM students
    WHERE full_name LIKE ?
       OR phone LIKE ?
       OR email LIKE ?
    ORDER BY id DESC
  `;

  db.query(sql, [keyword, keyword, keyword], (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});
// GET /api/enrollments/student/:studentId
router.get("/student/:studentId", (req, res) => {
  const { studentId } = req.params;

  const sql = `
    SELECT 
      c.id AS course_id,
      c.course_name,
      c.image,
      c.fee,
      c.description,
      c.platform,
      c.duration,
      e.status,
      e.enroll_date,
      e.created_at AS enrolled_at
    FROM enrollments e
    INNER JOIN courses c ON e.course_id = c.id
    WHERE e.student_id = ?
    ORDER BY e.created_at DESC
  `;

  db.query(sql, [studentId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Lỗi server" });
    }

    res.json({
      student_id: studentId,
      total: results.length,
      data: results,
    });
  });
});
router.put("/students/:id/change-password", (req, res) => {
  const { old_password, new_password, confirm_password } = req.body;
  const studentId = req.params.id;

  if (!old_password || !new_password || !confirm_password) {
    return res.status(400).json({ message: "Thiếu dữ liệu" });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({ message: "Mật khẩu xác nhận không khớp" });
  }

  // 1️⃣ Lấy mật khẩu hiện tại
  db.query(
    "SELECT password FROM students WHERE id = ?",
    [studentId],
    async (err, results) => {
      if (err) return res.status(500).json(err);
      if (results.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy học viên" });
      }

      const currentHashedPassword = results[0].password;

      // 2️⃣ So sánh mật khẩu cũ
      const isMatch = await bcrypt.compare(
        old_password,
        currentHashedPassword
      );

      if (!isMatch) {
        return res.status(400).json({ message: "Mật khẩu cũ không đúng" });
      }

      // 3️⃣ Hash mật khẩu mới
      const hashedPassword = await bcrypt.hash(new_password, 10);

      // 4️⃣ Update mật khẩu
      db.query(
        "UPDATE students SET password = ? WHERE id = ?",
        [hashedPassword, studentId],
        (err) => {
          if (err) return res.status(500).json(err);
          res.json({ message: "Đổi mật khẩu thành công" });
        }
      );
    }
  );
});
/* =========================
   KHÓA HỌC
========================= */

// Lấy danh sách khóa học
router.get("/courses", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;

  const { keyword, platform, sort , status} = req.query;
  console.log(req.query
  );
  
  let where = "WHERE 1=1";
  let params = [];

  // ===== SEARCH =====
  if (keyword) {
    where += " AND course_name LIKE ?";
    params.push(`%${keyword}%`);
  }

  if (status) {
    where += " AND status = ?";
    params.push(status);
  }
  // ===== PLATFORM FILTER =====
  if (platform) {
    where += " AND platform = ?";
    params.push(platform);
  }

  // ===== SORT =====
  let orderBy = "ORDER BY id DESC";
  if (sort === "price_asc") orderBy = "ORDER BY fee ASC";
  if (sort === "price_desc") orderBy = "ORDER BY fee DESC";
  if (sort === "newest") orderBy = "ORDER BY start_date DESC";

  // ===== SQL =====
  const sqlData = `
    SELECT *
    FROM courses
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const sqlCount = `
    SELECT COUNT(*) AS total
    FROM courses
    ${where}
  `;

  // ===== COUNT =====
  db.query(sqlCount, params, (err, countResult) => {
    if (err) return res.status(500).json(err);

    const total = countResult[0].total;

    // ===== DATA =====
    db.query(
      sqlData,
      [...params, limit, offset],
      (err, results) => {
        if (err) return res.status(500).json(err);

        res.json({
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          data: results,
        });
      }
    );
  });
});

// Thêm khóa học
router.post(
  "/courses",
  uploadCourseImage.single("image"),
  (req, res) => {
    const {
      course_code,
      course_name,
      description,
      duration,
      fee,
      start_date,
      platform,
      meet_link
    } = req.body;

    const image = req.file ? req.file.filename : null;

    const sql = `
      INSERT INTO courses
      (course_code, course_name, description, duration, fee, start_date, platform, image,meet_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        course_code,
        course_name,
        description,
        duration,
        fee,
        start_date,
        platform,
        image,
        meet_link
      ],
      (err) => {
        if (err) {
          // 🔴 Nếu trùng course_code
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
              message: "Mã khóa học đã tồn tại",
            });
          }

          console.error(err);
          return res.status(500).json({
            message: "Lỗi server",
          });
        }

        res.json({ message: "Thêm khóa học thành công" });
      }
    );
  }
);
// Cập nhật khóa học
router.put(
  "/courses/:id",
  uploadCourseImage.single("image"),
  (req, res) => {
    const courseId = req.params.id;
    const {
      course_code,
      course_name,
      description,
      duration,
      fee,
      start_date,
      platform,
      status, // Bổ sung status từ UI
      meet_link
    } = req.body;
    console.log("call api sửa khóa học");
    
    const newImage = req.file ? req.file.filename : null;

    // 1. Lấy thông tin ảnh cũ trước khi Update (Để xóa file vật lý)
    db.query("SELECT image FROM courses WHERE id = ?", [courseId], (err, results) => {
      if (err) return res.status(500).json(err);
      if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy khóa học" });

      const oldImage = results[0].image;

      // 2. Xây dựng câu lệnh SQL Update
      let sql = `
        UPDATE courses
        SET course_code = ?, 
            course_name = ?, 
            description = ?, 
            duration = ?, 
            fee = ?, 
            start_date = ?, 
            platform = ?,
            status = ?,
            meet_link = ?
      `;

      // Xử lý giá trị mặc định cho số để tránh lỗi SQL
      const params = [
        course_code,
        course_name,
        description,
        duration || 0, // Tránh null cho int
        fee || 0,      // Tránh null cho decimal
        start_date || null,
        platform,
        status || 'Đang mở',
        meet_link 
      ];

      // 3. Nếu có ảnh mới -> thêm vào SQL và xóa ảnh cũ
      if (newImage) {
        sql += ", image = ?";
        params.push(newImage);

        // Xóa file ảnh cũ khỏi thư mục (nếu có)
        if (oldImage) {
          const oldPath = path.join(__dirname, '../uploads/courses/', oldImage);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath); // Xóa file
          }
        }
      }

      sql += " WHERE id = ?";
      params.push(courseId);

      // 4. Thực thi Update
      db.query(sql, params, (updateErr) => {
        if (updateErr) {
          console.error("UPDATE COURSE ERROR:", updateErr);
          return res.status(500).json(updateErr);
        }
        res.json({ message: "Cập nhật khóa học thành công", image: newImage || oldImage });
      });
    });
  }
);
// Tìm kiếm khóa học
router.get("/courses/search", (req, res) => {
  const keyword = `%${req.query.q || ""}%`;

  const sql = `
    SELECT * FROM courses
    WHERE course_name LIKE ?
    ORDER BY id DESC
  `;

  db.query(sql, [keyword], (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});
router.get("/courses/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      id,
      course_code,
      course_name,
      description,
      platform,
      duration,
      fee,
      start_date,
      status,
      image,
      created_at
    FROM courses
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [id], (err, results) => {
    if (err) return res.status(500).json(err);

    if (results.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy khóa học",
      });
    }

    res.json(results[0]);
  });
});
// DELETE course
router.delete("/courses/:id", (req, res) => {
  const { id } = req.params;

  const sql = "DELETE FROM courses WHERE id = ?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        message: "Lỗi server",
      });
    }

    // Nếu không tìm thấy id
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "❌ Không tìm thấy khóa học",
      });
    }

    res.json({
      message: "✅ Xóa khóa học thành công",
    });
  });
});
/* =========================
   ĐĂNG KÝ KHÓA HỌC
========================= */

// Đăng ký học viên vào khóa học
router.post("/enrollments", (req, res) => {
  const { student_id, course_id } = req.body;

  if (!student_id || !course_id) {
    return res.status(400).json({ message: "Thiếu student_id hoặc course_id" });
  }

  console.log("gọi api enrollments", student_id, course_id);

  const sqlInsert =
    "INSERT INTO enrollments (student_id, course_id, paid_at,transaction_id) VALUES (?, ?, null,0)";

  db.query(sqlInsert, [student_id, course_id], (err, result) => {
    if (err) {
      console.error("INSERT ERROR:", err);

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          message: "Bạn đã đăng ký khóa học này rồi",
        });
      }

      return res.status(500).json({
        message: "Lỗi hệ thống khi insert enrollments",
        error: err.sqlMessage,
      });
    }

    // ================= GET INFO =================
    const sqlGetInfo = `
      SELECT s.full_name, s.email, s.phone, c.course_name, c.fee
      FROM students s
      JOIN courses c ON c.id = ?
      WHERE s.id = ?
    `;

    db.query(sqlGetInfo, [course_id, student_id], (infoErr, infoResult) => {
      if (infoErr) {
        console.error("GET INFO ERROR:", infoErr);

        return res.json({
          message: "Đăng ký thành công nhưng lỗi lấy thông tin",
        });
      }

      if (!infoResult || infoResult.length === 0) {
        return res.json({
          message: "Đăng ký thành công (không tìm thấy info)",
        });
      }

      const info = infoResult[0];

      // ================= EMAIL =================
      const mailOptions = {
        from: '"SYSTEM" <your-email@gmail.com>',
        to: process.env.GMAIL_USER,
        subject: `Đăng ký mới: ${info.full_name} - ${info.course_name}`,
        html: `
         <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
  
  <div style="background-color: #1a73e8; padding: 20px; text-align: center;">
    <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">THÔNG BÁO ĐĂNG KÝ</h2>
  </div>

  <div style="padding: 30px; background-color: #ffffff;">
    <p style="color: #5f6368; font-size: 16px; margin-bottom: 25px;">
      Hệ thống vừa ghi nhận một thông tin đăng ký mới với các chi tiết sau:
    </p>

    <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
      <tr>
        <td style="padding: 12px 0; color: #80868b; width: 35%; border-bottom: 1px solid #f1f3f4;">Học viên:</td>
        <td style="padding: 12px 0; color: #202124; font-weight: 600; border-bottom: 1px solid #f1f3f4;">
          ${info.full_name}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #80868b; border-bottom: 1px solid #f1f3f4;">Email:</td>
        <td style="padding: 12px 0; color: #1a73e8; border-bottom: 1px solid #f1f3f4;">
          ${info.email}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #80868b; border-bottom: 1px solid #f1f3f4;">Khóa học:</td>
        <td style="padding: 12px 0; color: #202124; font-weight: 600; border-bottom: 1px solid #f1f3f4;">
          ${info.course_name}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #80868b; border-bottom: 1px solid #f1f3f4;">Học phí:</td>
        <td style="padding: 12px 0; color: #d93025; font-weight: bold; font-size: 18px; border-bottom: 1px solid #f1f3f4;">
          ${Number(info.fee || 0).toLocaleString()}đ
        </td>
      </tr>
    </table>

    <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #70757a;">
        Vui lòng kiểm tra lại thông tin và xác nhận với học viên sớm nhất có thể.
      </p>
    </div>
  </div>
</div>
        `,
      };

      // tránh crash nếu transporter lỗi
      try {
        transporter.sendMail(mailOptions, (mailErr) => {
          if (mailErr) {
            console.error("MAIL ERROR:", mailErr);
          }
        });
      } catch (e) {
        console.error("Transporter crash:", e);
      }

      return res.json({
        message: "Đăng ký khóa học thành công",
      });
    });
  });
});
router.get("/enrollments", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const { course_id, keyword } = req.query;

  let where = "WHERE 1=1";
  const params = [];

  if (course_id) {
    where += " AND c.id = ?";
    params.push(course_id);
  }

  if (keyword) {
    where += `
      AND (
        s.full_name LIKE ?
        OR s.email LIKE ?
        OR s.phone LIKE ?
        OR c.course_name LIKE ?
      )
    `;
    params.push(
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`
    );
  }

  const sqlData = `
    SELECT
      -- Enrollment
      e.id AS enrollment_id,
      e.enroll_date,
      e.status AS enrollment_status,

      -- Student
      s.id AS student_id,
      s.student_code,
      s.full_name,
      s.gender,
      s.date_of_birth,
      s.phone,
      s.email,
      s.address,
      s.created_at AS student_created_at,

      -- Course
      c.id AS course_id,
      c.course_code,
      c.course_name,
      c.description,
      c.platform,
      c.duration,
      c.fee,
      c.start_date,
      c.status AS course_status,
      c.created_at AS course_created_at

    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    JOIN courses c ON e.course_id = c.id
    ${where}
    ORDER BY e.enroll_date DESC
    LIMIT ? OFFSET ?
  `;

  const sqlCount = `
    SELECT COUNT(*) AS total
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    JOIN courses c ON e.course_id = c.id
    ${where}
  `;

  db.query(sqlCount, params, (err, countResult) => {
    if (err) return res.status(500).json(err);

    const total = countResult[0].total;

    db.query(
      sqlData,
      [...params, limit, offset],
      (err, results) => {
        if (err) return res.status(500).json(err);

        res.json({
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          data: results,
        });
      }
    );
  });
});
router.patch("/enrollments/:id/status", (req, res) => {
  const { id } = req.params;
  const { status: newStatus } = req.body;

  const STATUS_LEVELS = {
    "Chờ xác nhận": 1,
    "Đang học": 2,
    "Hoàn thành": 3,
    "Hủy": 0,
  };

  // 1. Kiểm tra trạng thái hiện tại (Dùng Callback)
  db.query(
    "SELECT status FROM enrollments WHERE id = ?",
    [id],
    (err, results) => {
      if (err) {
        console.error("Lỗi truy vấn:", err);
        return res.status(500).json({ success: false, message: "Lỗi cơ sở dữ liệu" });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });
      }

      const currentStatus = results[0].status;
      const currentLevel = STATUS_LEVELS[currentStatus] || 0;
      const nextLevel = STATUS_LEVELS[newStatus];

      // 2. Logic chặn quay đầu (Workflow)
      if (currentLevel === 3 || currentLevel === 0) {
        return res.status(400).json({
          success: false,
          message: `Hồ sơ đã ở trạng thái [${currentStatus}], không thể thay đổi.`,
        });
      }

      if (newStatus !== "Hủy" && nextLevel <= currentLevel) {
        return res.status(400).json({
          success: false,
          message: "Quy trình chỉ cho phép nâng cấp trạng thái, không thể quay lại.",
        });
      }

      // 3. Thực hiện cập nhật (Dùng Callback lồng nhau)
      db.query(
        "UPDATE enrollments SET status = ? WHERE id = ?",
        [newStatus, id],
        (updateErr, updateResults) => {
          if (updateErr) {
            console.error("Lỗi cập nhật:", updateErr);
            return res.status(500).json({ success: false, message: "Cập nhật thất bại" });
          }

          return res.status(200).json({
            success: true,
            message: "Cập nhật trạng thái thành công!",
          });
        }
      );
    }
  );
});
/* =========================
   THỐNG KÊ – BÁO CÁO
========================= */


// 1. Doanh thu theo từng khóa học (Dành cho biểu đồ cột)
router.get("/revenue-by-course", (req, res) => {
  const sql = `
    SELECT 
      c.course_name,
      COUNT(e.id) as total_students,
      SUM(c.fee) as total_revenue
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    WHERE e.status = 'Hoàn thành'
    GROUP BY c.id, c.course_name
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

// 2. Doanh thu theo tháng (Dành cho biểu đồ đường)
router.get("/revenue-monthly", (req, res) => {
  const sql = `
    SELECT 
      DATE_FORMAT(e.enroll_date, '%Y-%m') as month,
      SUM(c.fee) as monthly_revenue
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    WHERE e.status = 'Hoàn thành'
    GROUP BY month
    ORDER BY month ASC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

// 3. Tóm tắt số lượng học viên theo khóa (Cho biểu đồ chính ban đầu)
router.get("/course-summary", (req, res) => {
  const sql = `
    SELECT c.course_name, COUNT(e.id) as total_students
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    GROUP BY c.id, c.course_name
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

// 4. Danh sách chi tiết học viên
router.get("/students-by-course", (req, res) => {
  const sql = `
    SELECT c.course_name, s.full_name, e.enroll_date, e.status, c.fee
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    JOIN courses c ON e.course_id = c.id
    ORDER BY e.enroll_date DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});
router.get("/attendance/report/:course_id", (req, res) => {
  const sql = `
    SELECT s.full_name, COUNT(a.id) as total
    FROM students s
    LEFT JOIN attendance a 
      ON s.id = a.student_id 
      AND a.course_id=?
    GROUP BY s.id
  `;

  db.query(sql, [req.params.course_id], (err, result) => {
    if (err) return res.status(500).json({ success: false });

    res.json({ data: result });
  });
});

/**
 * Thanh toán
 */
// router.put("/students/:course_id/pay", (req, res) => {
//   const courseId = req.params.course_id;
//   const userId = req.body.user_id; // Lấy user_id từ body gửi lên

//   console.log(`Đang thanh toán khóa học ${courseId} cho học viên ${userId}`);

//   // Câu lệnh SQL kiểm tra cả 2 điều kiện để đảm bảo an toàn
//   const sql = "UPDATE enrollments SET status='Đang học', paid_at=NOW() WHERE course_id=? AND student_id=?";

//   db.query(sql, [courseId, userId], (err, result) => {
//     if (err) {
//       console.error("Lỗi MySQL:", err);
//       return res.status(500).json({ message: "Lỗi server" });
//     }

//     if (result.affectedRows === 0) {
//       return res.status(404).json({ message: "Không tìm thấy dữ liệu đăng ký phù hợp" });
//     }

//     res.json({ message: "Thanh toán thành công" });
//   });
// });

router.post("/students/:course_id/momo", async (req, res) => {
  const courseId = req.params.course_id;
  const { user_id: userId } = req.body;
  const amount = Math.round(Number(req.body.amount));

  console.log("===== CREATE MOMO PAYMENT =====");
  console.log("Course:", courseId);
  console.log("User:", userId);
  console.log("Amount:", amount);

  try {
    const crypto = require("crypto");
    const https = require("https");

    const partnerCode = "MOMO";
    const accessKey = "F8BBA842ECF85";
    const secretKey = "K951B6PE1waDMi640xX08PD3vg6EkVlz";

    const requestId = partnerCode + new Date().getTime();
    const orderId = requestId;
    const orderInfo = `Thanh toán khóa học ${courseId}`;
    const redirectUrl = "http://localhost:3000/payment-success";
    const ipnUrl = "https://fc0c-1-53-53-166.ngrok-free.app/api/momo/ipn";
    const requestType = "payWithATM"; // nhập STK ngân hàng
    const extraData = `${courseId}|${userId}`;

    // 🔥 Thứ tự bắt buộc đúng như MoMo yêu cầu
    const rawSignature =
      "accessKey=" + accessKey +
      "&amount=" + amount +
      "&extraData=" + extraData +
      "&ipnUrl=" + ipnUrl +
      "&orderId=" + orderId +
      "&orderInfo=" + orderInfo +
      "&partnerCode=" + partnerCode +
      "&redirectUrl=" + redirectUrl +
      "&requestId=" + requestId +
      "&requestType=" + requestType;

    console.log("RawSignature:", rawSignature);

    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(rawSignature)
      .digest("hex");

    console.log("Signature:", signature);

    const requestBody = JSON.stringify({
      partnerCode,
      accessKey,
      requestId,
      amount: amount.toString(), // MoMo thích string
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData,
      requestType,
      signature,
      lang: "vi"
    });

    const options = {
      hostname: "test-payment.momo.vn",
      port: 443,
      path: "/v2/gateway/api/create",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody)
      }
    };

    const momoReq = https.request(options, momoRes => {
      let data = "";

      momoRes.on("data", chunk => {
        data += chunk;
      });

      momoRes.on("end", () => {
        const result = JSON.parse(data);
        console.log("MoMo Response:", result);
        res.json(result);
      });
    });

    momoReq.on("error", (e) => {
      console.error("MoMo Request Error:", e.message);
      res.status(500).json({ message: "MoMo connection error" });
    });

    console.log("Sending to MoMo...");
    momoReq.write(requestBody);
    momoReq.end();

  } catch (err) {
    console.error("===== MOMO CREATE ERROR =====");
    console.error(err);
    res.status(500).json({
      message: "Tạo thanh toán thất bại",
      error: err.message,
    });
  }
});
router.post("/momo/ipn", async (req, res) => {
  console.log("===== MOMO IPN RECEIVED =====");
  console.log("IPN Body:", req.body);

  try {
    const crypto = require("crypto");

    

     const partnerCode = "MOMO";
    const accessKey = "F8BBA842ECF85";
    const secretKey = "K951B6PE1waDMi640xX08PD3vg6EkVlz";
    const {
      orderId,
      requestId,
      amount,
      orderInfo,
      orderType,
      transId,
      resultCode,
      message,
      payType,
      responseTime,
      extraData,
      signature,
    } = req.body;

    const rawSignature =
      `accessKey=${accessKey}` +
      `&amount=${amount}` +
      `&extraData=${extraData}` +
      `&message=${message}` +
      `&orderId=${orderId}` +
      `&orderInfo=${orderInfo}` +
      `&orderType=${orderType}` +
      `&partnerCode=${partnerCode}` +
      `&payType=${payType}` +
      `&requestId=${requestId}` +
      `&responseTime=${responseTime}` +
      `&resultCode=${resultCode}` +
      `&transId=${transId}`;

    const checkSignature = crypto
      .createHmac("sha256", secretKey)
      .update(rawSignature)
      .digest("hex");

    console.log("IPN Signature:", signature);
    console.log("Calculated Signature:", checkSignature);

    if (signature !== checkSignature) {
      console.error("❌ SIGNATURE KHÔNG HỢP LỆ");
      return res.status(400).json({ message: "Invalid signature" });
    }

    console.log("✅ SIGNATURE HỢP LỆ");

    if (Number(resultCode) === 0) {
      const [courseId, userId] = extraData.split("|");

      const sql = `
        UPDATE enrollments 
        SET status='Đang học',
            paid_at=NOW(),
                transaction_id=?

        WHERE course_id=? AND student_id=?
      `;

      db.query(sql, [transId, courseId, userId], (err, result) => {
        if (err) {
          console.error("❌ Lỗi MySQL:", err);
        } else {
          console.log("✅ Update thành công:", result);
        }
      });

    } else {
      console.log("❌ Thanh toán thất bại:", resultCode);
    }

    res.status(200).json({ message: "OK" });

  } catch (err) {
    console.error("===== IPN ERROR =====");
    console.error(err);
    res.status(500).json({ message: "Error" });
  }
});

router.post("/attendance", (req, res) => {
  const { student_id, course_id } = req.body;

  // 1. check đã điểm danh chưa
  const checkSql =
    "SELECT * FROM attendance WHERE student_id=? AND course_id=?";

  db.query(checkSql, [student_id, course_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi kiểm tra điểm danh",
      });
    }

    // nếu đã tồn tại
    if (result.length > 0) {
      return res.json({
        success: false,
        message: "Bạn đã điểm danh rồi",
      });
    }

    // 2. insert attendance
    const insertSql =
      "INSERT INTO attendance (student_id, course_id) VALUES (?,?)";

    db.query(insertSql, [student_id, course_id], (err2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({
          success: false,
          message: "Lỗi server khi điểm danh",
        });
      }

      return res.json({
        success: true,
        message: "Điểm danh thành công",
        meetLink: "https://meet.google.com/abc-defg-hij",
      });
    });
  });
});
router.get("/attendance/check", (req, res) => {
  const { student_id, course_id } = req.query;

  const sql =
    "SELECT * FROM attendance WHERE student_id=? AND course_id=? AND DATE(created_at)=CURDATE() LIMIT 1";

  db.query(sql, [student_id, course_id], (err, result) => {
    if (err) return res.status(500).json({ success: false });

    if (result.length > 0) {
      return res.json({
        isAttended: true,
        meetLink: "https://meet.google.com/abc-defg-hij",
      });
    }

    return res.json({
      isAttended: false,
    });
  });
});
  router.get("/attendance/list", (req, res) => {
   const sql = `
    SELECT 
      c.id AS course_id,
      c.course_name,
      c.meet_link,

      COUNT(a.id) AS total_attendance,

      CASE 
        WHEN COUNT(a.id) > 0 THEN 'Đã điểm danh'
        ELSE 'Chưa có điểm danh'
      END AS status

    FROM courses c
    LEFT JOIN attendance a ON a.course_id = c.id
    GROUP BY c.id, c.course_name, c.meet_link
    ORDER BY c.id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ data: result });
  });
  });
router.get("/attendance/course/:course_id", (req, res) => {
  const { course_id } = req.params;

  const sql = `
    SELECT 
      a.id,
      a.created_at,
      s.full_name,
      s.email,
      c.course_name
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    JOIN courses c ON a.course_id = c.id
    WHERE a.course_id = ?
    ORDER BY a.created_at DESC
  `;

  db.query(sql, [course_id], (err, result) => {
    if (err) return res.status(500).json({ success: false });

    res.json({
      success: true,
      data: result,
    });
  });
});
router.post("/courses/:id/send-notify", async (req, res) => {
  const courseId = req.params.id;

  try {
    // 1. Lấy thông tin lớp
    const [course] = await db.promise().query(
      "SELECT * FROM courses WHERE id = ?",
      [courseId]
    );

    if (!course.length) {
      return res.status(404).json({ message: "Không tìm thấy lớp" });
    }

    const classInfo = course[0];

    // 2. Lấy danh sách học viên
    const [students] = await db.promise().query(
      `SELECT s.email, s.full_name
       FROM enrollments e
       JOIN students s ON e.student_id = s.id
       WHERE e.course_id = ?`,
      [courseId]
    );

    if (!students.length) {
      return res.status(400).json({ message: "Lớp chưa có học viên" });
    }
    console.log(classInfo);
    
    // 3. Gửi mail hàng loạt (tối ưu hơn loop thường)
    await Promise.all(
      students.map((st) =>
        transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: st.email,
          subject: `📢 Thông báo vào lớp: ${classInfo.course_name}`,
          html: `
           <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 20px auto; padding: 30px; border-radius: 15px; background-color: #ffffff; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #eee;">
  
  <h2 style="color: #2d3436; margin-top: 0; font-size: 24px;">
    Xin chào, <span style="color: #0984e3;">${st.full_name}</span> 👋
  </h2>
  
  <p style="color: #636e72; line-height: 1.6; font-size: 16px;">
    Lớp học <strong style="color: #2d3436;">${classInfo.course_name}</strong> của bạn đã sẵn sàng để bắt đầu. Đừng bỏ lỡ những kiến thức thú vị hôm nay nhé!
  </p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${classInfo.meet_link}" 
       target="_blank" 
       style="background-color: #00b894; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; transition: background-color 0.3s ease;">
      Vào lớp học ngay
    </a>
  </div>

  <div style="background-color: #f9f9f9; border-left: 4px solid #00b894; padding: 15px; margin-bottom: 20px;">
    <p style="margin: 0; font-size: 14px; color: #636e72;">
      <strong>Link dự phòng:</strong><br/>
      <a href="${classInfo.meet_link}" style="color: #0984e3; text-decoration: none; word-break: break-all;">
        ${classInfo.meet_link || "Chưa có link"}
      </a>
    </p>
  </div>

  <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">

  <p style="color: #b2bec3; font-size: 13px; text-align: center; font-style: italic;">
    Vui lòng có mặt đúng giờ để lớp học diễn ra tốt đẹp nhất.
  </p>
</div>
          `,
        })
      )
    );

    return res.json({
      success: true,
      message: `Đã gửi email cho ${students.length} học viên`,
    });

  } catch (err) {
    console.log("SEND MAIL ERROR:", err);
    return res.status(500).json({ message: "Lỗi server gửi mail" });
  }
});
module.exports = router;