const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPromise = require("../mysql/db");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Email gửi đi
    pass: process.env.GMAIL_PASS, // Mật khẩu ứng dụng (App Password)
  },
});
const router = express.Router();
const SITE_NAME = process.env.SITE_NAME;

async function sendOtpMail(email, otp) {
  await transporter.sendMail({
    from: "Hệ thống DUC THANG MEDIA",
    to: email,
    subject: "Mã xác thực OTP",
    html: `<h2>Mã OTP của bạn: ${otp}</h2>
           <p>Mã có hiệu lực trong 5 phút.</p>`
  });
}
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();


router.post("/login", (req, res) => {
  console.log("🔥 call api login");

  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ? AND status = 1";

  dbPromise.query(sql, [email], async (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Lỗi server" });
    }

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Email không tồn tại",
      });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Mật khẩu không đúng",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
        phone: user.phone,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  });
});
/* =======================
   LOGIN
======================= */
router.post("/loginuser", (req, res) => {
  const { email, password } = req.body;

  dbPromise.query(
    "SELECT * FROM students WHERE email = ?",
    [email],
    async (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Lỗi server" });
      }

      if (rows.length === 0) {
        return res
          .status(401)
          .json({ message: "Sai email hoặc mật khẩu" });
      }

      const user = rows[0];

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ message: "Sai email hoặc mật khẩu" });
      }

      // 🚫 CHƯA VERIFY
      if (user.is_verified === 0) {
        const otp = generateOTP();

        dbPromise.query(
          "DELETE FROM email_otps WHERE student_id = ?",
          [user.id],
          (err) => {
            if (err) return res.status(500).json({ message: "Lỗi server" });

            dbPromise.query(
              `INSERT INTO email_otps (student_id, otp, expired_at)
               VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
              [user.id, otp],
              async (err) => {
                if (err)
                  return res.status(500).json({ message: "Lỗi server" });

                await transporter.sendMail({
                  to: user.email,
                  subject: "Mã xác thực OTP",
                  html: `
                  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 450px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 25px;">
                      <h2 style="color: #1a73e8; margin: 0; font-size: 24px; font-weight: 700;">Xác thực tài khoản</h2>
                      <p style="color: #5f6368; font-size: 14px; margin-top: 8px;">Vui lòng sử dụng mã dưới đây để hoàn tất đăng ký.</p>
                    </div>

                    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; text-align: center; border: 1px dashed #c1c1c1;">
                      <span style="display: block; font-size: 12px; text-transform: uppercase; color: #70757a; letter-spacing: 1.5px; margin-bottom: 10px;">Mã OTP của bạn</span>
                      <h1 style="margin: 0; font-size: 42px; letter-spacing: 8px; color: #202124; font-family: 'Courier New', Courier, monospace;">${otp}</h1>
                    </div>

                    <div style="margin-top: 25px; text-align: center;">
                      <p style="color: #d93025; font-size: 13px; font-weight: 500; margin-bottom: 5px;">
                        ⚠️ Mã này sẽ hết hạn sau <strong>5 phút</strong>
                      </p>
                      <p style="color: #9aa0a6; font-size: 12px; line-height: 1.5;">
                        Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này hoặc liên hệ với bộ phận hỗ trợ để bảo mật tài khoản.
                      </p>
                    </div>

                    <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;">
                    
                    <div style="text-align: center; color: #bdc1c6; font-size: 11px;">
                      &copy;${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.
                    </div>
                  </div>
                  `
                });

                return res.status(403).json({
                  code: "EMAIL_NOT_VERIFIED",
                  student_id: user.id,
                  message: "Tài khoản chưa xác thực email",
                });
              }
            );
          }
        );

        return;
      }

      // ✅ LOGIN OK
      const token = jwt.sign(
        { id: user.id, email: user.email, role: "student" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        message: "Đăng nhập thành công",
        token,
        user,
      });
    }
  );
});




/* =======================
   REGISTER
======================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // 1️⃣ Validate dữ liệu
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "Thiếu thông tin" });
    }

    if (!/^0[1-9][0-9]{8}$/.test(phone)) {
      return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Mật khẩu tối thiểu 6 ký tự" });
    }

    // 2️⃣ Check email tồn tại
    dbPromise.query(
      "SELECT * FROM students WHERE email = ?",
      [email],
      async (err, rows) => {
        if (err) return res.status(500).json({ message: "Lỗi server" });

        // ===============================
        // 🚫 EMAIL ĐÃ TỒN TẠI
        // ===============================
        if (rows.length > 0) {
          const user = rows[0];

          // 👉 Nếu đã verify rồi
          if (user.is_verified === 1) {
            return res.status(409).json({
              message: "Email đã được sử dụng",
              type: "EMAIL_EXISTS"
            });
          }

          // 👉 Nếu chưa verify → resend OTP
          const otp = generateOTP();

          // Xoá OTP cũ
          dbPromise.query(
            "DELETE FROM email_otps WHERE student_id = ?",
            [user.id]
          );

          // Tạo OTP mới
          dbPromise.query(
            "INSERT INTO email_otps (student_id, otp, expired_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))",
            [user.id, otp],
            async (err) => {
              if (err) return res.status(500).json({ message: "Lỗi OTP" });

              await sendOtpMail(email, otp);

              return res.json({
                message: "Email chưa xác thực. OTP đã được gửi lại.",
                student_id: user.id,
                type: "RESEND_OTP"
              });
            }
          );

          return;
        }

        // ===============================
        // ✅ EMAIL CHƯA TỒN TẠI → TẠO MỚI
        // ===============================

        const hashPassword = await bcrypt.hash(password, 10);

        dbPromise.query(
          "INSERT INTO students (full_name, email, password, phone, role, is_verified) VALUES (?, ?, ?, ?, ?, 0)",
          [name, email, hashPassword, phone, "student"],
          async (err, result) => {
            if (err) return res.status(500).json({ message: "Lỗi tạo user" });

            const otp = generateOTP();

            dbPromise.query(
              "INSERT INTO email_otps (student_id, otp, expired_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))",
              [result.insertId, otp],
              async (err) => {
                if (err) return res.status(500).json({ message: "Lỗi OTP" });

                await sendOtpMail(email, otp);

                return res.json({
                  message: "Đăng ký thành công. OTP đã gửi.",
                  student_id: result.insertId,
                  type: "REGISTER_SUCCESS"
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
router.post("/verify-otp", (req, res) => {
  console.log("📥 [VERIFY OTP] Body:", req.body);

  const { student_id, otp } = req.body;

  if (!student_id || !otp) {
    console.log("⚠️ Thiếu student_id hoặc otp");
    return res.status(400).json({ message: "Thiếu dữ liệu xác thực" });
  }

  console.log(
    `🔍 Kiểm tra OTP | student_id=${student_id} | otp=${otp}`
  );

  const sql = `
    SELECT * FROM email_otps 
    WHERE student_id = ? AND otp = ? AND expired_at > NOW()
  `;

  dbPromise.query(sql, [student_id, otp], (err, rows) => {
    if (err) {
      console.error("❌ Lỗi query kiểm tra OTP:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }

    if (rows.length === 0) {
      console.log(
        `⛔ OTP không hợp lệ hoặc hết hạn | student_id=${student_id}`
      );
      return res
        .status(400)
        .json({ message: "OTP không đúng hoặc đã hết hạn" });
    }

    console.log("✅ OTP hợp lệ, tiến hành xác thực email");

    // cập nhật trạng thái xác thực
    dbPromise.query(
      "UPDATE students SET is_verified = 1 WHERE id = ?",
      [student_id],
      (err) => {
        if (err) {
          console.error("❌ Lỗi update is_verified:", err);
          return res.status(500).json({ message: "Lỗi cập nhật xác thực" });
        }

        console.log(
          "✅ Đã cập nhật is_verified = 1 cho student:",
          student_id
        );

        // xoá OTP sau khi dùng
        dbPromise.query(
          "DELETE FROM email_otps WHERE student_id = ?",
          [student_id],
          (err) => {
            if (err) {
              console.error("⚠️ Lỗi xoá OTP (có thể bỏ qua):", err);
            } else {
              console.log(
                "🧹 Đã xoá OTP cho student:",
                student_id
              );
            }

            res.json({ message: "Xác thực email thành công" });
          }
        );
      }
    );
  });
});



/* =======================
   LOGIN
======================= */
router.post("/loginu", (req, res) => {
  console.log("call user");
  
  const { email, password } = req.body;
  console.log(req.body);
  
  const sql = "SELECT * FROM students WHERE email = ?";

  dbPromise.query(sql, [email], async (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Lỗi server" });
    }

    if (rows.length === 0) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: "student",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "student",
      },
    });
  });
});

/* =======================
   ROUTE ĐƯỢC BẢO VỆ
======================= */
// router.get("/profile", verifyToken, async (req, res) => {
//   res.json({
//     message: "OK - đã đăng nhập",
//     user: req.user,
//   });
// });

module.exports = router;

