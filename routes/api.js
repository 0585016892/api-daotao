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
      res.json({ message: "✅ Thêm học viên thành công" });
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

    res.json({ message: "✅ Cập nhật học viên thành công" });
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
    return res.status(400).json({ message: "❌ Thiếu dữ liệu" });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({ message: "❌ Mật khẩu xác nhận không khớp" });
  }

  // 1️⃣ Lấy mật khẩu hiện tại
  db.query(
    "SELECT password FROM students WHERE id = ?",
    [studentId],
    async (err, results) => {
      if (err) return res.status(500).json(err);
      if (results.length === 0) {
        return res.status(404).json({ message: "❌ Không tìm thấy học viên" });
      }

      const currentHashedPassword = results[0].password;

      // 2️⃣ So sánh mật khẩu cũ
      const isMatch = await bcrypt.compare(
        old_password,
        currentHashedPassword
      );

      if (!isMatch) {
        return res.status(400).json({ message: "❌ Mật khẩu cũ không đúng" });
      }

      // 3️⃣ Hash mật khẩu mới
      const hashedPassword = await bcrypt.hash(new_password, 10);

      // 4️⃣ Update mật khẩu
      db.query(
        "UPDATE students SET password = ? WHERE id = ?",
        [hashedPassword, studentId],
        (err) => {
          if (err) return res.status(500).json(err);
          res.json({ message: "✅ Đổi mật khẩu thành công" });
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
    } = req.body;

    const image = req.file ? req.file.filename : null;

    const sql = `
      INSERT INTO courses
      (course_code, course_name, description, duration, fee, start_date, platform, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      ],
      (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json(err);
        }
        res.json({ message: "✅ Thêm khóa học thành công" });
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
            status = ?
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
        status || 'Đang mở'
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
        res.json({ message: "✅ Cập nhật khóa học thành công", image: newImage || oldImage });
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

/* =========================
   ĐĂNG KÝ KHÓA HỌC
========================= */

// Đăng ký học viên vào khóa học
router.post("/enrollments", (req, res) => {
  const { student_id, course_id } = req.body;

  // 1. Thực hiện Đăng ký vào Database trước
  const sqlInsert = `INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)`;

  db.query(sqlInsert, [student_id, course_id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        return res.status(409).json({ message: "Bạn đã đăng ký khóa học này rồi" });
      }
      return res.status(500).json({ message: "Lỗi hệ thống", error: err });
    }

    // 2. Lấy thông tin chi tiết (Tên học viên, Tên khóa học, Học phí) để gửi mail
    const sqlGetInfo = `
      SELECT s.full_name, s.email, s.phone, c.course_name, c.fee 
      FROM students s, courses c 
      WHERE s.id = ? AND c.id = ?
    `;

    db.query(sqlGetInfo, [student_id, course_id], (infoErr, infoResult) => {
      if (infoErr || infoResult.length === 0) {
        // Nếu lỗi lấy thông tin thì vẫn báo thành công đăng ký nhưng log lỗi mail
        return res.json({ message: "Đăng ký thành công (Lỗi gửi mail thông báo)" });
      }

      const info = infoResult[0];

      // 3. Gửi Email với Template đẹp
      const mailOptions = {
        from: '"DUC THANG MEDIA 🚀" <email-cua-ban@gmail.com>',
        to: process.env.GMAIL_USER, // Email nhận thông báo
        subject: `🔥 ĐĂNG KÝ MỚI: ${info.full_name.toUpperCase()} - ${info.course_name}`,
        html: `
          <div style="background-color: #0b0e14; padding: 40px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #ffffff;">
            <div style="max-width: 600px; margin: 0 auto; background: #121821; border: 1px solid #1e2633; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
              
              <div style="background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px; color: #000; letter-spacing: 1px;">THÔNG BÁO ĐĂNG KÝ MỚI</h1>
              </div>

              <div style="padding: 30px;">
                <p style="color: #888; font-size: 16px;">Chào Admin, hệ thống vừa ghi nhận một lượt đăng ký khóa học mới từ website.</p>
                
                <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.05);">
                  <h3 style="color: #4facfe; margin-top: 0; border-bottom: 1px solid #1e2633; padding-bottom: 10px;">👤 Thông tin học viên</h3>
                  <p style="margin: 10px 0;"><strong>Họ và tên:</strong> ${info.full_name}</p>
                  <p style="margin: 10px 0;"><strong>Email:</strong> ${info.email}</p>
                  <p style="margin: 10px 0;"><strong>Số điện thoại:</strong> ${info.phone || 'Chưa cập nhật'}</p>
                </div>

                <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.05);">
                  <h3 style="color: #b388ff; margin-top: 0; border-bottom: 1px solid #1e2633; padding-bottom: 10px;">📚 Thông tin khóa học</h3>
                  <p style="margin: 10px 0;"><strong>Tên khóa học:</strong> ${info.course_name}</p>
                  <p style="margin: 10px 0;"><strong>Học phí:</strong> <span style="color: #ff4d4f; font-weight: bold;">${Number(info.fee).toLocaleString()}đ</span></p>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                  <a href="http://your-admin-url.com" style="background: #4facfe; color: #000; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">TRUY CẬP QUẢN TRỊ</a>
                </div>
              </div>

              <div style="background: rgba(0,0,0,0.2); padding: 20px; text-align: center; font-size: 12px; color: #555;">
                <p>Email này được gửi tự động từ hệ thống quản lý đào tạo <strong>DUC THANG MEDIA</strong>.</p>
                <p>&copy; ${new Date().getFullYear()} Duc Thang Media. All rights reserved.</p>
              </div>
            </div>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (mailErr) => {
        if (mailErr) console.error("Lỗi gửi mail:", mailErr);
        else console.log("✅ Đã gửi mail thông báo cho Admin");
      });

      res.json({ message: "Đăng ký khóa học thành công" });
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

module.exports = router;