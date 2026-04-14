import type { PrismaClient } from "../generated/prisma/index.js";

export declare const prisma: PrismaClient;
export declare function connectDB(): Promise<void>;
