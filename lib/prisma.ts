import { PrismaClient } from "@prisma/client";

// dev 熱重載時重用同一個 client，避免把 Postgres 連線數用光
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
