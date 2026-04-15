import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, ROUNDS);
}

export function comparePassword(plain, passwordHash) {
  return bcrypt.compareSync(plain, passwordHash);
}
