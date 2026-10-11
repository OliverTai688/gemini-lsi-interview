import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { requireOwnedSession } from "@/lib/guards";

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
export async function POST(req: Request, context: any) {
    const { id } = await context.params;
    const sessionId = id;
    const guard = await requireOwnedSession(sessionId);
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

        const transcript = session.turns
            .map((t) => `${t.speaker}: ${t.text}`)
            .join("\n");

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

以下是逐字稿：
${transcript}

        `;

        const response = await client.responses.create({
            model: "gpt-4o-mini",
            input: prompt,
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
export async function GET(req: Request, context: any) {
    const { id } = await context.params;
    const sessionId = id;
    const guard = await requireOwnedSession(sessionId);
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
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Failed to fetch summary", detail: String(err) },
            { status: 500 }
        );
    }
}
