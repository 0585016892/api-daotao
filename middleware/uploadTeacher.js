const multer = require("multer");
const path = require("path");

// lưu file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/teachers/");
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      uniqueName + path.extname(file.originalname)
    );
  },
});

// filter image
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ được upload ảnh"), false);
  }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;