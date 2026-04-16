import express from "express";
import { prisma } from "../src/config/db.js";
import { comparePassword } from "../src/lib/password.js";

const router = express.Router();

function validateLoginBody(body) {
  const errors = {};
  const loginId = typeof body.loginId === "string" ? body.loginId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!loginId) errors.loginId = "아이디를 입력하세요.";
  if (!password) errors.password = "비밀번호를 입력하세요.";

  return { errors, loginId, password };
}

function safeReturnUrl(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

router.get("/login", (req, res) => {
  if (res.locals.currentUser) {
    if (res.locals.currentUser.role === "CLAIMANT") {
      return res.redirect("/claims/new");
    }
    return res.redirect("/");
  }
  const returnUrl = safeReturnUrl(req.query.next);
  res.render("auth/login", {
    title: "로그인",
    errors: {},
    values: { loginId: "" },
    flashError: null,
    returnUrl,
  });
});

router.post("/login", async (req, res, next) => {
  if (res.locals.currentUser) {
    if (res.locals.currentUser.role === "CLAIMANT") {
      return res.redirect("/claims/new");
    }
    return res.redirect("/");
  }

  const { errors, loginId, password } = validateLoginBody(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).render("auth/login", {
      title: "로그인",
      errors,
      values: { loginId },
      flashError: null,
      returnUrl: safeReturnUrl(req.body.returnUrl),
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { loginId },
      select: {
        id: true,
        loginId: true,
        name: true,
        role: true,
        passwordHash: true,
        isActive: true,
      },
    });

    const ok =
      user &&
      user.isActive &&
      comparePassword(password, user.passwordHash);

    if (!ok) {
      return res.status(401).render("auth/login", {
        title: "로그인",
        errors: {},
        values: { loginId },
        flashError: "아이디 또는 비밀번호가 올바르지 않습니다.",
        returnUrl: safeReturnUrl(req.body.returnUrl),
      });
    }

    req.session.userId = user.id;
    req.session.loginId = user.loginId;
    req.session.name = user.name;
    req.session.role = user.role;

    if (user.role === "CLAIMANT") {
      return res.redirect("/claims/new");
    }
    return res.redirect(safeReturnUrl(req.body.returnUrl));
  } catch (e) {
    return next(e);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("cfm.sid", { path: "/" });
    return res.redirect("/login");
  });
});

export default router;
