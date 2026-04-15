export function attachSessionUser(req, res, next) {
  const s = req.session;
  if (s?.userId) {
    res.locals.currentUser = {
      id: s.userId,
      loginId: s.loginId,
      name: s.name,
      role: s.role,
    };
  } else {
    res.locals.currentUser = null;
  }
  next();
}
