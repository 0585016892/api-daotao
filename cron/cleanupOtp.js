const cron = require("node-cron");
const dbPromise = require("../mysql/db"); // chỉnh path cho đúng

// chạy mỗi 1 phút
cron.schedule("* * * * *", () => {
  console.log("🧹 [CRON] Đang xoá OTP hết hạn...");

  const sql = `
    DELETE FROM email_otps 
    WHERE expired_at < NOW()
  `;

  dbPromise.query(sql, (err, result) => {
    if (err) {
      console.error("❌ [CRON] Lỗi xoá OTP:", err);
    } else {
      if (result.affectedRows > 0) {
        console.log(`✅ [CRON] Đã xoá ${result.affectedRows} OTP hết hạn`);
      } else {
        console.log("ℹ️ [CRON] Không có OTP hết hạn");
      }
    }
  });
});
