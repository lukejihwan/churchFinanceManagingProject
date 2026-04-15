import express from "express";
import { prisma } from "../src/config/db.js";
import { hashPassword } from "../src/lib/password.js";
const router = express.Router();

function validateBody(body) {
  const errors = {};
  const loginId = typeof body.loginId === "string" ? body.loginId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!loginId) errors.loginId = "아이디를 입력하세요.";
  else if (loginId.length > 50) errors.loginId = "아이디는 50자 이하여야 합니다.";

  if (!password) errors.password = "비밀번호를 입력하세요.";
  else if (password.length < 8) errors.password = "비밀번호는 8자 이상이어야 합니다.";

  if (!name) errors.name = "이름을 입력하세요.";
  else if (name.length > 100) errors.name = "이름은 100자 이하여야 합니다.";

  return { errors, loginId, password, name };
}

router.get("/new", (req, res) => {
  res.render("admin/user-create", {
    title: "사용자 계정 생성",
    errors: {},
    values: { loginId: "", name: "" },
    ok: req.query.ok === "1",
  });
});

router.post("/", async (req, res, next) => {
  const { errors, loginId, password, name } = validateBody(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).render("admin/user-create", {
      title: "사용자 계정 생성",
      errors,
      values: { loginId, name },
      ok: false,
    });
  }

  try {
    const passwordHash = hashPassword(password);
    await prisma.user.create({
      data: {
        loginId,
        passwordHash,
        name,
        role: "CLAIMANT",
        isActive: true,
      },
    });
    return res.redirect("/admin/users/new?ok=1");
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).render("admin/user-create", {
        title: "사용자 계정 생성",
        errors: { loginId: "이미 사용 중인 아이디입니다." },
        values: { loginId, name },
        ok: false,
      });
    }
    return next(e);
  }
});

export default router;
