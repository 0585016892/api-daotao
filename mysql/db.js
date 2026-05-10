const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",        // đổi nếu có mật khẩu
  database: "quanly_daotao"
});

db.connect((err) => {
  if (err) {
    console.error("❌ Kết nối MySQL thất bại:", err);
    return;
  }
  console.log("✅ MySQL connected");
});
// 🔥 WRAP PROMISE
db.queryAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};
module.exports = db;
