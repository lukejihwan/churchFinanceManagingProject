import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  if (res.locals.currentUser?.role === "CLAIMANT") {
    return res.redirect("/claims/new");
  }
  res.render("index", { title: "교회 재정 관리" });
});

export default router;
