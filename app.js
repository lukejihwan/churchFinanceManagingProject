import "dotenv/config";
import createError from "http-errors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import logger from "morgan";
import session from "express-session";

import indexRouter from "./routes/index.js";
import usersRouter from "./routes/users.js";
import adminRouter from "./routes/admin.js";
import authRouter from "./routes/auth.js";
import { attachSessionUser } from "./src/middleware/sessionUser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && !sessionSecret) {
  throw new Error("SESSION_SECRET 환경 변수가 필요합니다.");
}

app.use(
  session({
    name: "cfm.sid",
    secret: sessionSecret || "development-session-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
    },
  }),
);
app.use(attachSessionUser);

app.use("/", authRouter);
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/admin", adminRouter);
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  res.status(err.status || 500);
  res.render("error");
});

export default app;
