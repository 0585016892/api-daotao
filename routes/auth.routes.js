const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPromise = require("../mysql/db");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");

// ✅ TẠO LIMITER Ở ĐÂY
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10, // tối đa 10 request
  keyGenerator: (req) => req.ip + (req.body.email || ""),
  message: {
    message: "Bạn gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau."
  }
});
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
    html: `
<div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 40px 0;">
  <div style="max-width: 500px; margin: auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4f46e5, #3b82f6); padding: 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">
        Xác thực tài khoản
      </h1>
    </div>

    <!-- Body -->
    <div style="padding: 30px; text-align: center;">
      <p style="font-size: 15px; color: #555;">
        Đức Thắng Media, Xin chào!<br/>
        Cảm ơn bạn đã đăng ký tài khoản.
      </p>

      <p style="font-size: 14px; color: #777;">
        Vui lòng sử dụng mã OTP bên dưới để xác thực email của bạn:
      </p>

      <!-- OTP Box -->
      <div style="
        margin: 25px 0;
        padding: 15px 0;
        font-size: 28px;
        letter-spacing: 8px;
        font-weight: bold;
        color: #4f46e5;
        background: #f1f5ff;
        border-radius: 8px;
      ">
        ${otp}
      </div>

      <p style="font-size: 13px; color: #999;">
        ⏳ Mã có hiệu lực trong <strong>1 phút</strong>.<br/>
        Không chia sẻ mã này cho bất kỳ ai.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #aaa;">
      © ${new Date().getFullYear()} Hệ thống quản lý đào tạo<br/>
      Đây là email tự động, vui lòng không trả lời.
    </div>

  </div>
</div>
`
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
               VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 MINUTE))`,
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

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // ================= VALIDATE =================
    if (!name || !email || !password || !phone)
      return res.status(400).json({ message: "Thiếu thông tin" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: "Email không hợp lệ" });

    if (!/^0[1-9][0-9]{8}$/.test(phone))
      return res.status(400).json({ message: "SĐT không hợp lệ" });

    if (password.length < 6)
      return res.status(400).json({ message: "Mật khẩu tối thiểu 6 ký tự" });

    // ================= CHECK EMAIL =================
    dbPromise.query(
      "SELECT * FROM students WHERE email = ?",
      [email],
      async (err, users) => {
        if (err) return res.status(500).json({ message: "Lỗi server" });

        let studentId;

        // ================= EMAIL ĐÃ TỒN TẠI =================
        if (users.length > 0) {
          const user = users[0];

          if (user.is_verified === 1) {
            return res.status(409).json({
              message: "Email đã được sử dụng",
              type: "EMAIL_EXISTS"
            });
          }

          studentId = user.id;

          dbPromise.query(
            "SELECT * FROM email_otps WHERE student_id = ? ORDER BY created_at DESC LIMIT 1",
            [studentId],
            async (err, lastOtpRows) => {
              if (err) return res.status(500).json({ message: "Lỗi OTP" });

              if (lastOtpRows.length > 0) {
                const lastOtp = lastOtpRows[0];

                // 🔴 Nếu bị block
                if (
                  lastOtp.blocked_until &&
                  new Date(lastOtp.blocked_until) > new Date()
                ) {
                  return res.status(429).json({
                    message:
                      "Bạn đã gửi OTP quá nhiều lần. Thử lại sau 10 phút."
                  });
                }

                const secondsPassed =
                  (Date.now() -
                    new Date(lastOtp.created_at).getTime()) /
                  1000;

                if (secondsPassed < 30) {
                  return res.status(429).json({
                    message:
                      "Vui lòng đợi 30 giây trước khi gửi lại OTP"
                  });
                }

                if (lastOtp.resend_count >= 5) {
                  dbPromise.query(
                    "UPDATE email_otps SET blocked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?",
                    [lastOtp.id]
                  );

                  return res.status(429).json({
                    message:
                      "Bạn đã gửi OTP quá nhiều lần. Bị khóa 10 phút."
                  });
                }
              }

              createAndSendOtp(studentId, email, res, "RESEND_OTP");
            }
          );
        } 
        // ================= EMAIL CHƯA TỒN TẠI =================
        else {
          const hashPassword = await bcrypt.hash(password, 10);

          dbPromise.query(
            `INSERT INTO students 
             (full_name, email, password, phone, role, is_verified)
             VALUES (?, ?, ?, ?, ?, 0)`,
            [name, email, hashPassword, phone, "student"],
            (err, result) => {
              if (err)
                return res.status(500).json({ message: "Lỗi tạo user" });

              studentId = result.insertId;

              createAndSendOtp(
                studentId,
                email,
                res,
                "REGISTER_SUCCESS"
              );
            }
          );
        }
      }
    );
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
});


// ================== HÀM TẠO OTP ==================
async function createAndSendOtp(studentId, email, res, type) {
  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 10);

  dbPromise.query(
    "DELETE FROM email_otps WHERE student_id = ?",
    [studentId],
    () => {
      dbPromise.query(
        `INSERT INTO email_otps
         (student_id, otp_hash, expired_at, resend_count)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 MINUTE), 1)`,
        [studentId, otpHash],
        async (err) => {
          if (err)
            return res.status(500).json({ message: "Lỗi tạo OTP" });

          await sendOtpMail(email, otp);

          return res.json({
            message: "OTP đã được gửi",
            student_id: studentId,
            type
          });
        }
      );
    }
  );
}
router.post("/verify-otp", (req, res) => {
  const { student_id, otp } = req.body;

  if (!student_id || !otp) {
    return res.status(400).json({ message: "Thiếu dữ liệu" });
  }

  dbPromise.query(
    "SELECT * FROM email_otps WHERE student_id = ? ORDER BY created_at DESC LIMIT 1",
    [student_id],
    async (err, rows) => {
      if (err) {
        console.error("OTP QUERY ERROR:", err);
        return res.status(500).json({ message: "Lỗi server" });
      }

      if (rows.length === 0) {
        return res.status(400).json({ message: "OTP không tồn tại" });
      }

      const record = rows[0];

      // 🔴 Kiểm tra hết hạn
      if (new Date(record.expired_at) < new Date()) {
        return res.status(400).json({ message: "OTP đã hết hạn" });
      }

      // 🔐 So sánh OTP
      const isMatch = await bcrypt.compare(otp, record.otp_hash);

      if (!isMatch) {
        return res.status(400).json({ message: "OTP không đúng" });
      }

      // ✅ Cập nhật xác thực
      dbPromise.query(
        "UPDATE students SET is_verified = 1 WHERE id = ?",
        [student_id],
        (err) => {
          if (err) {
            console.error("VERIFY UPDATE ERROR:", err);
            return res.status(500).json({ message: "Lỗi cập nhật user" });
          }

          // 🧹 Xóa OTP sau khi xác thực
          dbPromise.query(
            "DELETE FROM email_otps WHERE student_id = ?",
            [student_id],
            (err) => {
              if (err) {
                console.error("DELETE OTP ERROR:", err);
                return res.status(500).json({ message: "Lỗi xóa OTP" });
              }

              return res.json({
                message: "Xác thực thành công"
              });
            }
          );
        }
      );
    }
  );
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

