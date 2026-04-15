import createError from "http-errors";

export function requireLogin(req, res, next) {
  if (!res.locals.currentUser) {
    const nextUrl = encodeURIComponent(req.originalUrl || "/");
    return res.redirect(`/login?next=${nextUrl}`);
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!res.locals.currentUser) {
    const nextUrl = encodeURIComponent(req.originalUrl || "/");
    return res.redirect(`/login?next=${nextUrl}`);
  }
  if (res.locals.currentUser.role !== "ADMIN") {
    return next(createError(403, "관리자만 접근할 수 있습니다."));
  }
  next();
}
