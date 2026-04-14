import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.render("index", { title: "교회 재정 관리" });
});

export default router;
