import "./seedLoadEnv.js";
import { prisma } from "./config/db.js";
import { hashPassword } from "./lib/password.js";
import { UserRole } from "./generated/prisma/index.js";

async function main() {
  const loginId = process.env.SEED_ADMIN_LOGIN_ID?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "시스템 관리자";

  if (!loginId || !password) {
    throw new Error(
      "시드에 필요한 환경 변수가 없습니다: SEED_ADMIN_LOGIN_ID, SEED_ADMIN_PASSWORD",
    );
  }

  const passwordHash = hashPassword(password);

  await prisma.user.upsert({
    where: { loginId },
    create: {
      loginId,
      passwordHash,
      name,
      role: UserRole.ADMIN,
      isActive: true,
    },
    update: {
      passwordHash,
      name,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`관리자 계정 시드 완료: loginId=${loginId}`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

if (process.exitCode) process.exit(process.exitCode);
