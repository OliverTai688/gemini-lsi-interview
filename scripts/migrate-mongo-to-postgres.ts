// 一次性：把舊 MongoDB 的資料搬到 Supabase Postgres
//
// 用法（先跑完 prisma migrate deploy）：
//   MONGODB_URL="mongodb+srv://..." DATABASE_URL="postgresql://..." \
//     npx tsx scripts/migrate-mongo-to-postgres.ts
//
// - 沿用原本的 ObjectId 字串當主鍵 → 舊的 /session/<id> 網址不會失效
// - 可重複執行（已存在的資料列會跳過）
// - Turn.audioBase64 不搬：那是分段 base64 直接相接的字串，無法可靠還原成音檔
//   （MongoDB 上的原始資料不會被更動）

import { MongoClient, type Document } from "mongodb";
import { Prisma, PrismaClient } from "@prisma/client";

const BATCH = 500;

const prisma = new PrismaClient();

const id = (v: unknown) => String(v);
const date = (v: unknown) => (v instanceof Date ? v : undefined);

async function copy<T>(
  label: string,
  docs: AsyncIterable<Document>,
  map: (doc: Document) => T | null,
  insert: (rows: T[]) => Promise<{ count: number }>
) {
  let read = 0;
  let written = 0;
  let skipped = 0;
  let batch: T[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    written += (await insert(batch)).count;
    batch = [];
  };

  for await (const doc of docs) {
    read++;
    const row = map(doc);
    if (!row) {
      skipped++;
      continue;
    }
    batch.push(row);
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.log(
    `${label}: 讀取 ${read}、寫入 ${written}、略過（孤兒資料）${skipped}、已存在 ${read - written - skipped}`
  );
}

async function main() {
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error("Missing env MONGODB_URL");

  const mongo = new MongoClient(url);
  await mongo.connect();
  const db = mongo.db();

  try {
    // ---------- User ----------
    const userIds = new Set<string>();
    await copy<Prisma.UserCreateManyInput>(
      "User",
      db.collection("User").find(),
      (d) => {
        userIds.add(id(d._id));
        return {
          id: id(d._id),
          name: d.name ?? null,
          email: d.email,
          emailVerified: date(d.emailVerified) ?? null,
          image: d.image ?? null,
          onboardingCompleted: d.onboardingCompleted ?? false,
          createdAt: date(d.createdAt),
          updatedAt: date(d.updatedAt) ?? new Date(),
        };
      },
      (data) => prisma.user.createMany({ data, skipDuplicates: true })
    );

    // ---------- Account ----------
    await copy<Prisma.AccountCreateManyInput>(
      "Account",
      db.collection("Account").find(),
      (d) =>
        userIds.has(id(d.userId))
          ? {
              id: id(d._id),
              userId: id(d.userId),
              provider: d.provider,
              providerAccountId: d.providerAccountId,
              type: d.type ?? null,
              access_token: d.access_token ?? null,
              refresh_token: d.refresh_token ?? null,
              expires_at: d.expires_at ?? null,
              scope: d.scope ?? null,
              token_type: d.token_type ?? null,
              id_token: d.id_token ?? null,
            }
          : null,
      (data) => prisma.account.createMany({ data, skipDuplicates: true })
    );

    // ---------- Session ----------
    const sessionIds = new Set<string>();
    await copy<Prisma.SessionCreateManyInput>(
      "Session",
      db.collection("Session").find(),
      (d) => {
        if (!userIds.has(id(d.userId))) return null;
        sessionIds.add(id(d._id));
        return {
          id: id(d._id),
          userId: id(d.userId),
          title: d.title ?? null,
          createdAt: date(d.createdAt),
          summary: d.summary ?? Prisma.JsonNull,
        };
      },
      (data) => prisma.session.createMany({ data, skipDuplicates: true })
    );

    // ---------- Turn（不讀 audioBase64）----------
    await copy<Prisma.TurnCreateManyInput>(
      "Turn",
      db.collection("Turn").find({}, { projection: { audioBase64: 0 } }),
      (d) =>
        sessionIds.has(id(d.sessionId))
          ? {
              id: id(d._id),
              sessionId: id(d.sessionId),
              speaker: d.speaker,
              text: d.text ?? "",
              replied: d.replied ?? false,
              createdAt: date(d.createdAt),
            }
          : null,
      (data) => prisma.turn.createMany({ data, skipDuplicates: true })
    );
  } finally {
    await mongo.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
