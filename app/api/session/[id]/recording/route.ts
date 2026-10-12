// app/api/session/[id]/recording/route.ts
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";

import { prisma } from "@/lib/prisma";
import { requireOwnedSession } from "@/lib/guards";
import { deleteObjects, getObjectBytes, putObject } from "@/lib/r2";
import { ASSET_RULES } from "@/lib/assets";
import { logAdmin } from "@/lib/admin-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const run = promisify(execFile);

// 本機 / 自架主機可以用 FFMPEG_PATH 指到系統的 ffmpeg
const ffmpegPath = () => process.env.FFMPEG_PATH || ffmpegStatic;

// -------------------------
// POST：把這場訪談的錄音分段合併成單一檔案（不重新編碼），存回 R2
// 已經合併過的話會以最新的分段重做一次
// -------------------------
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId, { allowAdmin: true });
  if (!guard.ok) return guard.response;

  const segments = await prisma.asset.findMany({
    where: { sessionId, kind: "INTERVIEW_AUDIO", status: "READY" },
    orderBy: [{ startedAt: "asc" }, { seq: "asc" }, { createdAt: "asc" }],
  });
  if (segments.length === 0) {
    return NextResponse.json({ error: "No recording" }, { status: 400 });
  }

  // 不重新編碼的合併只能處理同一種格式（換過瀏覽器的話會有 webm 與 m4a 混在一起）
  const contentType = segments[0].contentType;
  if (segments.some((s) => s.contentType !== contentType)) {
    return NextResponse.json(
      { error: "Mixed recording formats cannot be merged" },
      { status: 409 }
    );
  }

  const binary = ffmpegPath();
  if (!binary) {
    return NextResponse.json({ error: "ffmpeg unavailable" }, { status: 501 });
  }

  const ext = ASSET_RULES.INTERVIEW_AUDIO.types[contentType] ?? "webm";
  const dir = await mkdtemp(join(tmpdir(), "lsi-merge-"));

  try {
    // 1) 下載分段，寫出 ffmpeg concat 清單
    //    MediaRecorder 產生的檔案沒有時長資訊，所以每段的 duration 用我們自己記的
    const lines: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const file = join(dir, `${String(i).padStart(5, "0")}.${ext}`);
      await writeFile(file, await getObjectBytes(segments[i].objectKey));
      lines.push(`file '${file}'`);
      if (segments[i].durationMs) {
        lines.push(`duration ${(segments[i].durationMs! / 1000).toFixed(3)}`);
      }
    }
    const listFile = join(dir, "list.txt");
    await writeFile(listFile, lines.join("\n"));

    // 2) 合併（-c copy：只重新封裝，不重新編碼）
    const outFile = join(dir, `merged.${ext}`);
    await run(binary, [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      "-y", outFile,
    ]);

    // 3) 上傳，換掉舊的合併檔
    const merged = await readFile(outFile);
    const objectKey = `sessions/${sessionId}/interview_audio_merged/${randomUUID()}.${ext}`;
    await putObject(objectKey, merged, contentType);

    const previous = await prisma.asset.findMany({
      where: { sessionId, kind: "INTERVIEW_AUDIO_MERGED" },
      select: { id: true, objectKey: true },
    });

    const asset = await prisma.asset.create({
      data: {
        sessionId,
        kind: "INTERVIEW_AUDIO_MERGED",
        status: "READY",
        objectKey,
        contentType,
        sizeBytes: merged.length,
        durationMs: segments.reduce((sum, s) => sum + (s.durationMs ?? 0), 0),
        startedAt: segments[0].startedAt,
        seq: segments.length,
      },
    });

    if (previous.length > 0) {
      await deleteObjects(previous.map((p) => p.objectKey));
      await prisma.asset.deleteMany({
        where: { id: { in: previous.map((p) => p.id) } },
      });
    }

    if (!guard.isOwner) await logAdmin("recording.merge", guard.session.title ?? sessionId);

    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      url: `/api/assets/${asset.id}`,
      segments: segments.length,
      sizeBytes: merged.length,
    });
  } catch (err) {
    console.error("POST /recording error:", err);
    return NextResponse.json({ error: "Merge failed" }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
