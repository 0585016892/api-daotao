const express = require("express");
const multer = require("multer");
const axios = require("axios");

const router = express.Router();
const upload = multer();

router.post("/", upload.single("image"), async (req, res) => {
  console.log("\n===== OPENROUTER CHAT REQUEST =====");

  try {
    const { message } = req.body;
    const imageFile = req.file;

    console.log("📩 Message:", message);
    console.log("🖼 Có ảnh:", !!imageFile);

const prompt = `
Bạn là AI Mentor chuyên nghiệp tại hệ thống đào tạo trực tuyến. 
Nhiệm vụ của bạn là hỗ trợ học viên lựa chọn lộ trình học tập và giải đáp các thắc mắc về kỹ năng số.

🎯 Phạm vi tư vấn:
- Chỉ tập trung vào: Các khóa học (Facebook Ads, Google Ads, TikTok Ads, Zalo Marketing), lộ trình học tập, cách thức thanh toán (MoMo, VNPAY), hỗ trợ kỹ thuật khi vào học và tài liệu học tập.
- Nếu khách hỏi ngoài phạm vi giáo dục/marketing → Lịch sự từ chối và hướng người dùng quay lại chủ đề khóa học.

📌 Quy tắc phản hồi:
- Ngắn gọn, súc tích (3–6 dòng).
- Giọng văn: Chuyên nghiệp, hiện đại, "tech-savvy" nhưng vẫn gần gũi (phù hợp với giao diện Dark Mode/Dev).
- Không cam kết "học xong giàu ngay" hoặc "bao đỗ 100%".
- Khuyến khích học viên bắt đầu từ những bước cơ bản nếu là người mới.

📌 Quy trình tư vấn:
1. Giải thích nhanh giá trị của khóa học/kỹ năng đó.
2. Gợi ý lộ trình hoặc các module nổi bật.
3. Nếu vấn đề phức tạp → Hướng dẫn khách để lại SĐT hoặc liên hệ bộ phận kỹ thuật qua trang Profile.

📌 Đối với hình ảnh:
- Nếu khách gửi ảnh chuyển khoản → Xác nhận và nhắc khách kiểm tra trạng thái trong Profile.
- Nếu khách gửi ảnh lỗi kỹ thuật → Phân tích lỗi sơ bộ và đưa ra hướng xử lý nhanh (F5, xóa cache, kiểm tra mạng).

📌 Chào hỏi:
- Luôn giữ năng lượng tích cực, dùng các icon hiện đại như 🚀, ✨, 👨‍💻, 💳.

Câu hỏi từ học viên: ${message}
`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-8b-instruct",
        messages: [
          { role: "system", content: "Bạn là chuyên gia da liễu spa." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    console.log("✅ OpenRouter trả về:");
    console.log(reply);

    return res.json({
      success: true,
      reply
    });

  } catch (error) {
    console.error("❌ OpenRouter Error:");
    console.error(error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      reply: "Hệ thống tạm thời gián đoạn, bạn thử lại nhé ❤️"
    });
  }
});

module.exports = router;