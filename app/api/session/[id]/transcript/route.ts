// app/api/session/[id]/transcript/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GoogleGenAI } from "@google/genai";
import { requireOwnedSession } from "@/lib/guards";

export const runtime = "nodejs";

const genai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY!,
});

const FILE_UPLOAD_URL =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";

// -------------------------
// GET：取得 transcript
// -------------------------
export async function GET(req: Request, context: any) {
  const params = await context.params;
  const sessionId = params.id;
  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        turns: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const messages = session.turns.map((t) => ({
      role: t.speaker === "user" ? "user" : "model",   // 👈 修正
      content: t.text,
      timestamp: t.createdAt.toISOString(),
      startedAt: t.startedAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      title: session.title ?? "Interview Session",
      messages,
    });
  } catch (error) {
    console.error("GET /transcript error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// -------------------------
// Helper：REST 上傳 Gemini File
// -------------------------
async function uploadToGemini(file: File, apiKey: string) {
  const buffer = Buffer.from(await file.arrayBuffer());

  const res = await fetch(`${FILE_UPLOAD_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "x-goog-content-length-range": "0,104857600",
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error("Upload failed: " + (await res.text()));
  }

  return res.json();
}

// -------------------------
// POST：語音轉文字（或純文字）
// -------------------------
export async function POST(req: Request, context: any) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

  const contentType = req.headers.get("content-type") || "";
  let userText = "";

  try {
    // (A) 語音訊息
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio") as File | null;

      if (!audio) {
        return NextResponse.json(
          { error: "Audio missing" },
          { status: 400 }
        );
      }

      const uploadResponse = await uploadToGemini(
        audio,
        process.env.GOOGLE_API_KEY!
      );

      const result = await genai.models.generateContent({
        model: "gemini-2.5-flash-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  mimeType: audio.type,
                  fileUri: uploadResponse.file.uri,
                },
              },
              {
                text: "Transcribe this audio.",
              },
            ],
          },
        ],
      });

      // 🟢 正確解析 Gemini 2.0 的 text
      userText =
        result.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("") ?? "";
    }

    // (B) 純文字
    else {
      const body = await req.json();
      userText = body.text?.trim() || "";
    }

    if (!userText) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    const newTurn = await prisma.turn.create({
      data: {
        sessionId,
        speaker: "user",
        text: userText,
      },
    });

    return NextResponse.json({
      transcription: userText,
      turnId: newTurn.id,
      timestamp: newTurn.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /transcript error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
