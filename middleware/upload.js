const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/courses",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const uploadCourseImage = multer({ storage });

module.exports = uploadCourseImage;
