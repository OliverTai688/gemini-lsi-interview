import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { requireAdmin, requireOwnedSession } from "@/lib/guards";
import { presignRead } from "@/lib/r2";
import { logAdmin } from "@/lib/admin-log";
import { SUMMARY_MODEL } from "@/lib/models";

// 一次總結最多附幾張白板完成圖
const MAX_WHITEBOARDS = 8;

export const runtime = "nodejs";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

// ---------- JSON 清洗 ----------
function extractJson(raw: string) {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? match[0] : raw;
}

// ---------- POST ----------
// 較強的模型處理長逐字稿需要比較久
export const maxDuration = 300;

export async function POST(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const sessionId = id;
    // AI 總結只給研究者（管理者）看，受訪者本人也不行
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;
    const guard = await requireOwnedSession(sessionId, { allowAdmin: true });
    if (!guard.ok) return guard.response;

    try {
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { turns: { orderBy: { createdAt: "asc" } } },
        });

        if (!session) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        if (session.turns.length === 0) {
            return NextResponse.json(
                { error: "No messages in session" },
                { status: 400 }
            );
        }

        // 白板說明：依時間插進逐字稿，完成圖另外以圖片附給模型
        const whiteboards = await prisma.asset.findMany({
            where: { sessionId, kind: "WHITEBOARD_SNAPSHOT", status: "READY" },
            orderBy: { startedAt: "asc" },
            take: MAX_WHITEBOARDS,
        });
        const whiteboardImages = await Promise.all(
            whiteboards.map((w) => presignRead(w.objectKey))
        );

        const lines = [
            ...session.turns.map((t) => ({
                at: t.createdAt.getTime(),
                line: `${t.speaker}: ${t.text}`,
            })),
            ...whiteboards.map((w, i) => ({
                at: (w.startedAt ?? w.createdAt).getTime(),
                line: `[白板說明 #${i + 1}${w.title ? `：${w.title}` : ""}｜受訪者在此時畫了白板，內容見第 ${i + 1} 張附圖]`,
            })),
        ].sort((a, b) => a.at - b.at);

        const transcript = lines.map((l) => l.line).join("\n");

        const whiteboardNote =
            whiteboards.length > 0
                ? `
⚠️【白板附圖】
本次訪談附有 ${whiteboards.length} 張受訪者親手繪製的白板完成圖，依序對應逐字稿中的 [白板說明 #n] 標記。
白板上的文字與圖像視同受訪者的敘述，可以作為分析依據；
但只能描述圖中實際看得到的內容，看不清楚或無法判讀的部分不得臆測。
`
                : "";

        const prompt = `
        你是一位熟悉敘事心理學（Narrative Identity）、生命故事訪談（Life Story Interview; McAdams, 1996），
並參考 Adler et al. (2016)「meaning-making as growth」與心理治療敘事分析架構的專家。

請依據逐字稿，生成「繁體中文、段落式、深度描述」的 JSON。
內容必須嚴謹、完全基於逐字稿內容，並有助於心理學研究者進行質性分析。

⚠️【絕對禁止幻覺規則】⚠️  
1. 不得捏造逐字稿中不存在的事件。  
2. 不得擴寫不存在的人生轉折、高峰、低谷。  
3. 若逐字稿沒有提供足夠資訊支撐該欄位 → 必須回傳：  
   - 若欄位需「段落」→ 回傳：  
     "本段訪談未提供足夠資訊，因此無法形成可靠分析。"  
   - 若欄位為 list → 回傳：  
     ["insufficient_data: 本段訪談未提供足夠資訊"]  

⚠️【高嚴謹度要求】  
每個段落式欄位必須：  
- 僅根據逐字稿  
- 嚴格限制推論於「心理層次」  
- 不做事件層面的虛構  
- 文風接近心理學質性研究、敘事分析、治療取向研究  

⚠️【輸出要求】  
- 輸出 **有效 JSON**（不得有 markdown、不得有解釋文字）  
- 每個欄位「若有資料」需 **1–3 個完整段落**  
- 若無資料 → 使用上述「易讀 insufficient 格式」  

以下是唯一允許的 JSON 模板：

{
  "life_theme": "1–2 個段落。若無資料：『本段訪談未提供足夠資訊，因此無法形成可靠分析。』",

  "motifs": [
    "每條目為 2–3 句的母題段落。若不足則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "turning_points": [
    "1 個段落敘述每個轉折點。若逐字稿無具體事件，則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "high_points": [
    "段落描述生命高峰。若無相關內容則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "low_points": [
    "段落描述生命低谷。若無相關內容則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "future_script": [
    "段落描述未來敘事方向。若未提及則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "psychological_insights": [
    "段落式深度心理觀察。若逐字稿資訊不足則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "strengths": [
    "段落分析個體優勢。若逐字稿沒有展現特質，則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "growth_edges": [
    "段落分析發展邊緣。若無法推論則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ],

  "action_items": [
    "段落式建議。若無法依據逐字稿提出具體建議，則：['insufficient_data: 本段訪談未提供足夠資訊']"
  ]
}

${whiteboardNote}
以下是逐字稿：
${transcript}

        `;

        const response = await client.responses.create({
            model: SUMMARY_MODEL,
            input:
                whiteboardImages.length > 0
                    ? [
                          {
                              role: "user",
                              content: [
                                  { type: "input_text", text: prompt },
                                  ...whiteboardImages.map((image_url) => ({
                                      type: "input_image" as const,
                                      image_url,
                                      detail: "high" as const,
                                  })),
                              ],
                          },
                      ]
                    : prompt,
        });

        const rawText = response.output_text ?? "";
        const clean = extractJson(rawText);

        let jsonSummary = null;
        try {
            jsonSummary = JSON.parse(clean);
        } catch {
            console.error("JSON parse error:", clean);
            jsonSummary = { overview: clean };
        }

        // ★★★ save JSON object directly
        await prisma.session.update({
            where: { id: sessionId },
            data: { summary: jsonSummary },
        });
        await logAdmin("summary.generate", session.title ?? sessionId);

        return NextResponse.json({ sessionId, summary: jsonSummary });
    } catch (err) {
        console.error("POST SUMMARY ERROR:", err);
        return NextResponse.json(
            { error: "Failed to generate summary", detail: String(err) },
            { status: 500 }
        );
    }
}

// ---------- GET ----------
export async function GET(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const sessionId = id;
    // AI 總結只給研究者（管理者）看，受訪者本人也不行
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;
    const guard = await requireOwnedSession(sessionId, { allowAdmin: true });
    if (!guard.ok) return guard.response;

    try {
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { summary: true, title: true },
        });

        if (!session) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        return NextResponse.json({
            sessionId,
            summary: session.summary,  // ← Already JSON
            session_title: session.title,
            isOwner: guard.isOwner,
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Failed to fetch summary", detail: String(err) },
            { status: 500 }
        );
    }
}
