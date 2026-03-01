const express = require("express");
const db = require("../mysql/db");

const router = express.Router();

/**
 * GET /api/dashboard/overview
 * Tổng quan dashboard
 */
router.get("/overview", (req, res) => {
  const result = {};

  const sqlStudents = "SELECT COUNT(*) AS total FROM students";
  const sqlCourses = "SELECT COUNT(*) AS total FROM courses";
  const sqlEnrollments = "SELECT COUNT(*) AS total FROM enrollments";

  db.query(sqlStudents, (err, s) => {
    if (err) return res.status(500).json(err);
    result.totalStudents = s[0].total;

    db.query(sqlCourses, (err, c) => {
      if (err) return res.status(500).json(err);
      result.totalCourses = c[0].total;

      db.query(sqlEnrollments, (err, e) => {
        if (err) return res.status(500).json(err);
        result.totalEnrollments = e[0].total;

        res.json(result);
      });
    });
  });
});

/**
 * GET /api/dashboard/top-courses
 */
router.get("/top-courses", (req, res) => {
  const sql = `
    SELECT c.id, c.course_name, COUNT(e.id) AS total_students
    FROM courses c
    LEFT JOIN enrollments e ON c.id = e.course_id
    GROUP BY c.id
    ORDER BY total_students DESC
    LIMIT 5
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

/**
 * GET /api/dashboard/enrollments-by-month
 */
router.get("/enrollments-by-month", (req, res) => {
  const sql = `
    SELECT 
      MONTH(created_at) AS month,
      COUNT(*) AS total
    FROM enrollments
    GROUP BY MONTH(created_at)
    ORDER BY month
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

module.exports = router;
