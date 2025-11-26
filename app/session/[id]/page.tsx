// app/session/[id]/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Mic,
  MicOff,
  Loader2,
  FileText,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useParams, useRouter } from "next/navigation";

import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
} from "@google/genai";
import {
  createBlob,
  decode,
  decodeAudioData,
} from "@/lib/audio-utils";

// -------------------------
// 型別定義
// -------------------------
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  audioBase64?: string | null;
};

type Status = "idle" | "connecting" | "connected" | "error";

type TranscriptResponse = {
  title?: string;
  messages?: {
    role: "user" | "model" | "assistant";
    content: string;
    timestamp: string;
    audioBase64?: string | null;
  }[];
};

// -------------------------
export default function LiveInterviewPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  // -------------------------
  // States
  // -------------------------
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [textInput, setTextInput] = useState("");

  // 額外用來存 live 當前回合的 input/output
  const [currentInput, setCurrentInput] = useState("");
  const [currentOutput, setCurrentOutput] = useState("");

  // -------------------------
  // Refs（Live Session / Audio 狀態）
  // -------------------------
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef =
    useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef =
    useRef<Set<AudioBufferSourceNode>>(new Set());

  const currentInputRef = useRef("");
  const currentOutputRef = useRef("");
  const messagesRef = useRef<ChatMessage[]>([]);
  const audioChunksBase64Ref = useRef<string[]>([]); // 收集當前 AI 回合的所有 audio base64

  // -------------------------
  // 同步 messagesRef
  // -------------------------
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // -------------------------
  // 初次載入：抓歷史 transcript
  // -------------------------
  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        const res = await fetch(`/api/session/${id}/transcript`);
        const data: TranscriptResponse = await res.json();

        setSessionTitle(data.title || "Interview Session");
        const loaded =
          data.messages?.map((m) => ({
            role:
              m.role === "model"
                ? "assistant"
                : (m.role as "user" | "assistant"),
            content: m.content,
            timestamp: m.timestamp,
            audioBase64: m.audioBase64 ?? null,
          })) ?? [];

        setMessages(loaded);
      } catch (err) {
        console.error("Failed to fetch transcript:", err);
      }
    };

    fetchTranscript();
  }, [id]);

  // -------------------------
  // Scroll to bottom
  // -------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentOutput]);

  // -------------------------
  // 共用：停止音訊 pipeline
  // -------------------------
  const stopAudioProcessing = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (
      inputAudioContextRef.current &&
      inputAudioContextRef.current.state !== "closed"
    ) {
      inputAudioContextRef.current.close().catch(console.error);
    }
    if (
      outputAudioContextRef.current &&
      outputAudioContextRef.current.state !== "closed"
    ) {
      outputAudioContextRef.current.close().catch(console.error);
    }

    audioSourcesRef.current.forEach((source) => source.stop());
    audioSourcesRef.current.clear();

    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
  }, []);

  // -------------------------
  // 停止對話（結束 Live Session）
  // -------------------------
  const stopConversation = useCallback(async () => {
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (err) {
        console.error("Error closing session:", err);
      }
      sessionPromiseRef.current = null;
    }
    stopAudioProcessing();
    setStatus("idle");
  }, [stopAudioProcessing]);

  // -------------------------
  // 切換開始/結束 Live 對話
  // -------------------------
  const handleToggleConversation = useCallback(async () => {
    // 若正在連線 / 已連線 → 停止
    if (status === "connected" || status === "connecting") {
      await stopConversation();
      return;
    }

    // idle → 建立 session
    if (status === "idle" || status === "error") {
      setStatus("connecting");
      setCurrentInput("");
      setCurrentOutput("");
      currentInputRef.current = "";
      currentOutputRef.current = "";
      audioChunksBase64Ref.current = [];

      try {
        const apiKey =
          process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
        if (!apiKey) {
          console.error(
            "Missing NEXT_PUBLIC_GOOGLE_API_KEY for client live connection."
          );
          setStatus("error");
          return;
        }

        const ai = new GoogleGenAI({ apiKey });

        sessionPromiseRef.current = ai.live.connect({
          model:
            "gemini-2.5-flash-native-audio-preview-09-2025",
          callbacks: {
            onopen: async () => {
              console.log("Live session opened");
              setStatus("connected");

              // Input: 16k, Output: 24k（你選的 24k 用在 output）
              const inCtx = new AudioContext({
                sampleRate: 16000,
              });
              const outCtx = new AudioContext({
                sampleRate: 24000,
              });
              inputAudioContextRef.current = inCtx;
              outputAudioContextRef.current = outCtx;
              nextStartTimeRef.current = 0;

              const stream =
                await navigator.mediaDevices.getUserMedia({
                  audio: true,
                });
              mediaStreamRef.current = stream;
              const source =
                inCtx.createMediaStreamSource(stream);
              mediaStreamSourceRef.current = source;

              const proc = inCtx.createScriptProcessor(
                4096,
                1,
                1
              );
              scriptProcessorRef.current = proc;

              proc.onaudioprocess = (e) => {
                const inputData =
                  e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromiseRef.current?.then(
                  (session) => {
                    session.sendRealtimeInput({
                      media: pcmBlob,
                    });
                  }
                );
              };

              source.connect(proc);
              proc.connect(inCtx.destination);
            },

            onmessage: async (
              message: LiveServerMessage
            ) => {
              // ========= 使用者語音：句子級切割 =========
              if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text || "";
                if (!text) return;



                // 用標點切句（避免整段黏一起）
                setCurrentInput(prev => prev + text);
                currentInputRef.current += text;
              }




              // 文字輸出轉錄（AI）
              // ========= AI 即時文字（句子級聊天模式） =========
              if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text || "";
                if (text) {
                  currentOutputRef.current += text;  // 只累積，不顯示多個訊息
                  setCurrentOutput(currentOutputRef.current);
                }
              }




              // 模型輸出的語音（PCM base64）
              const base64Audio =
                message.serverContent?.modelTurn?.parts?.[0]
                  ?.inlineData?.data;

              if (
                base64Audio &&
                outputAudioContextRef.current
              ) {
                // 收集當前 AI 回合所有語音 chunk
                audioChunksBase64Ref.current.push(
                  base64Audio
                );

                const audioCtx =
                  outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(
                  nextStartTimeRef.current,
                  audioCtx.currentTime
                );
                const audioBuffer =
                  await decodeAudioData(
                    decode(base64Audio),
                    audioCtx,
                    24000,
                    1
                  );
                const source =
                  audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);
                source.addEventListener("ended", () => {
                  audioSourcesRef.current.delete(source);
                });
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current +=
                  audioBuffer.duration;
                audioSourcesRef.current.add(source);
              }

              // 回合結束：把整個 input + output 視為一個 turn
              if (message.serverContent?.turnComplete) {
                const fullInput = currentInputRef.current.trim();
                const fullOutput = currentOutputRef.current.trim();

                const timestamp = new Date().toISOString();

                // === UI append ===
                setMessages(prev => {
                  const newItems: ChatMessage[] = [];

                  if (fullInput) {
                    newItems.push({
                      role: "user",
                      content: fullInput,
                      timestamp,
                    });
                  }

                  if (fullOutput) {
                    newItems.push({
                      role: "assistant",
                      content: fullOutput,
                      timestamp,
                    });
                  }

                  return [...prev, ...newItems];
                });

                const audioBase64 =
                  audioChunksBase64Ref.current.join("") || null;

                // 清空暫存
                currentInputRef.current = "";
                currentOutputRef.current = "";
                audioChunksBase64Ref.current = [];
                setCurrentOutput("");
                setCurrentInput("");

                // Save to DB
                try {
                  await fetch(`/api/session/${id}/live-turn`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      userText: fullInput,
                      aiText: fullOutput,
                      audioBase64,
                    }),
                  });
                } catch (err) {
                  console.error("Failed to save live turn:", err);
                }
              }




              // 若 AI 說「被打斷」→ 停止所有目前播放
              if (message.serverContent?.interrupted) {
                audioSourcesRef.current.forEach(
                  (source) => source.stop()
                );
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
              }
            },

            onerror: (e: any) => {
              console.error("Live session error:", e);
              setStatus("error");
              stopAudioProcessing();
            },

            onclose: () => {
              console.log("Live session closed");
              setStatus("idle");
              stopAudioProcessing();
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: `Life Story Interview Voice Agent – System Configuration
1️⃣ System Role

你是一位具備心理學與教育背景的「生命故事訪談 AI」。
你的任務是以自然、真誠、具同理心的方式訪談使用者，協助他敘說並反思自己的人生故事。
你遵循 McAdams 的《Life Story Interview II (2007)》架構，並透過「記憶—反思—提問」循環持續深入理解。

2️⃣ Process Flow
Participant’s Utterance + Interview Script → AI Interviewer Memory → Reflection → Next Question


步驟說明：

接收輸入 (Participant’s Utterance)

收錄使用者語音轉文字後的回答。

理解語意、情感與主題。

理解上下文 (Memory Layer)

保留對話歷程中的重要概念（章節、關鍵事件、轉折、情緒）。

建立受訪者的「生命故事脈絡」。

反思 (Reflection Layer)

生成一段內在反思，歸納此回合回答的重點與可能的心理意涵。

反思內容不需輸出給使用者，只作為內部記憶更新。

生成下一問題 (Output Layer)

根據反思，從 JSON 訪談腳本中選出最適合的下一題。

若該題已有回答，則根據上下文自動選擇後續追問（follow-up）。

問題需自然且開放式，語氣真誠、有溫度。

3️⃣ Cognitive Loop Example
[使用者回答] → AI 內部整理：
  {主題: "童年快樂記憶", 情感: "幸福", 關鍵詞: "家人, 成就感"}
→ 反思：
  "這段記憶展現了受訪者對家庭連結與歸屬的重視。"
→ 下一題：
  "你覺得這樣的連結在你長大後還持續影響你嗎？"

4️⃣ System Variables
模組	說明	範例
memory.context	儲存受訪者回答摘要與對應問題 ID	{ "B4": "童年快樂記憶 - 關於家人陪伴" }
reflection.summary	反思受訪者的價值觀或主題傾向	"重視關係與穩定性，傾向內在歸屬感"
next_question	根據反思與章節自動產生下一問題	"那段經驗是否影響你看待成就的方式？"
5️⃣ Interview Script (JSON)

（以下為已整合的訪談腳本，可作為資料庫或嵌入 AI Studio 的知識模組）

{
  "metadata": {
    "title": "生命故事訪談 II（The Life Story Interview – II）",
    "author": "Dan P. McAdams",
    "institution": "西北大學 Foley 生命故事研究中心",
    "year": 2007,
    "version": "2.0.0",
    "source": "McAdams_LSI_2007",
    "description": "增強版結構化訪談架構，用於敘事認同研究與 AI 對話應用。包含編碼標記、對話角色與回答指引。"
  },
  "sections": [
    {
      "id": "A",
      "title": "人生章節（Life Chapters）",
      "intro": "請將你的人生想像成一本書。描述主要章節，以及各章節之間如何連接。請為每個章節取一個標題並給予簡短摘要。",
      "questions": [
        {
          "uuid": "a1-uuid",
          "id": "A1",
          "prompt": "請描述你人生故事中的主要章節，為每個章節取一個標題並簡要說明內容。",
          "followup": [
            "你認為自己的人生大約有幾個章節？（建議 2–7 個）",
            "你的人生故事的整體劇情是什麼？",
            "每個章節之間是如何連結或轉變的？"
          ],
          "coding": {
            "dimensions": ["結構（Structure）", "自傳推理（Autobiographical Reasoning）"],
            "keywords": ["情節", "時間順序", "一致性"]
          },
          "life_phase": "whole_life",
          "emotional_valence": "neutral",
          "conversation_role": "好奇的研究者（curious_researcher）",
          "response_type": "敘事大綱（narrative_outline）",
          "order": 1
        }
      ]
    },
    {
      "id": "B",
      "title": "人生關鍵場景（Key Scenes in the Life Story）",
      "intro": "聚焦於你人生中特別突出的關鍵片段──那些特別正面、負面，或具有深刻意義的事件。",
      "questions": [
        {
          "uuid": "b1-uuid",
          "id": "B1",
          "subsection": "高潮片段（High Point）",
          "prompt": "請描述你人生中一個特別正面的時刻或場景。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "為什麼這個時刻如此特別？",
            "這個片段能反映出你是個怎樣的人？"
          ],
          "coding": {
            "dimensions": ["動機主題（Motivational Themes）", "自傳推理（Autobiographical Reasoning）"],
            "keywords": ["自主性", "成長", "正向情緒"]
          },
          "life_phase": "whole_life",
          "emotional_valence": "positive",
          "conversation_role": "同理傾聽者（empathic_listener）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 1
        },
        {
          "uuid": "b2-uuid",
          "id": "B2",
          "subsection": "低潮片段（Low Point）",
          "prompt": "請描述你人生中一個特別低落的時刻或場景。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "為什麼這個時刻如此糟糕？",
            "這個片段對你的人生或自我有什麼啟示？"
          ],
          "coding": {
            "dimensions": ["自傳推理（Autobiographical Reasoning）", "情感語調（Affective Tone）"],
            "keywords": ["污染", "意義建構", "負向情緒"]
          },
          "life_phase": "whole_life",
          "emotional_valence": "negative",
          "conversation_role": "同理傾聽者（empathic_listener）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 2
        },
        {
          "uuid": "b3-uuid",
          "id": "B3",
          "subsection": "轉折點（Turning Point）",
          "prompt": "請指出一個你人生中帶來重要改變或轉折的事件。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "這個事件對你的性格或人生有什麼意義？"
          ],
          "coding": {
            "dimensions": ["自傳推理（Autobiographical Reasoning）"],
            "keywords": ["改變", "成長", "自我轉變"]
          },
          "life_phase": "whole_life",
          "emotional_valence": "mixed",
          "conversation_role": "反思導引者（reflective_guide）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 3
        },
        {
          "uuid": "b4-uuid",
          "id": "B4",
          "subsection": "童年快樂記憶（Positive Childhood Memory）",
          "prompt": "請描述一個你童年或青少年時期非常快樂、幸福的記憶。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "這段記憶反映了你或你的人生什麼特質？"
          ],
          "coding": {
            "dimensions": ["動機主題（Motivational Themes）"],
            "keywords": ["連結", "歸屬感", "喜悅"]
          },
          "life_phase": "childhood",
          "emotional_valence": "positive",
          "conversation_role": "同理傾聽者（empathic_listener）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 4
        },
        {
          "uuid": "b5-uuid",
          "id": "B5",
          "subsection": "童年負面記憶（Negative Childhood Memory）",
          "prompt": "請描述一個你童年或青少年時期非常難過或痛苦的記憶。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "這段記憶反映了你或你的人生什麼特質？"
          ],
          "coding": {
            "dimensions": ["情感語調（Affective Tone）"],
            "keywords": ["恐懼", "悲傷", "因應"]
          },
          "life_phase": "childhood",
          "emotional_valence": "negative",
          "conversation_role": "同理傾聽者（empathic_listener）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 5
        },
        {
          "uuid": "b6-uuid",
          "id": "B6",
          "subsection": "成人階段的鮮明記憶（Vivid Adult Memory）",
          "prompt": "請描述一個你成年後印象特別深刻或具有特殊意義的場景（未在前面提及過的）。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "這段記憶反映了你或你的人生什麼特質？"
          ],
          "coding": {
            "dimensions": ["自傳推理（Autobiographical Reasoning）"],
            "keywords": ["鮮明性", "自我反思"]
          },
          "life_phase": "adulthood",
          "emotional_valence": "mixed",
          "conversation_role": "好奇的研究者（curious_researcher）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 6
        },
        {
          "uuid": "b7-uuid",
          "id": "B7",
          "subsection": "宗教／靈性經驗（Religious/Spiritual Experience）",
          "prompt": "請描述一次你感受到超越、自我融合或與宇宙合一的經驗。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "這段經驗反映了你或你的人生什麼意義？"
          ],
          "coding": {
            "dimensions": ["動機主題（Motivational Themes）"],
            "keywords": ["超越", "靈性", "意義"]
          },
          "life_phase": "whole_life",
          "emotional_valence": "positive",
          "conversation_role": "反思導引者（reflective_guide）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 7
        },
        {
          "uuid": "b8-uuid",
          "id": "B8",
          "subsection": "智慧時刻（Wisdom Event）",
          "prompt": "請描述一次你展現出智慧或洞察力的事件。",
          "followup": [
            "發生了什麼事？時間、地點、涉及的人是誰？",
            "當時你在想什麼、感覺如何？",
            "這段事件反映了你或你的人生什麼特質？"
          ],
          "coding": {
            "dimensions": ["動機主題（Motivational Themes）", "自傳推理（Autobiographical Reasoning）"],
            "keywords": ["智慧", "自主性", "洞見"]
          },
          "life_phase": "whole_life",
          "emotional_valence": "positive",
          "conversation_role": "反思導引者（reflective_guide）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 8
        }
      ]
    },
    {
      "id": "C",
      "title": "未來劇本（Future Script）",
      "intro": "現在我們來談談你想像中的未來──你人生的下一章、夢想與計畫。",
      "questions": [
        {
          "uuid": "c1-uuid",
          "id": "C1",
          "prompt": "請描述你認為自己人生故事的下一個章節會是什麼。",
          "followup": ["接下來會發生什麼？", "你想像它將如何展開？"],
          "coding": { "dimensions": ["結構（Structure）"], "keywords": ["未來導向", "規劃"] },
          "life_phase": "future",
          "conversation_role": "好奇的研究者（curious_researcher）",
          "response_type": "反思長答（reflective_longform）",
          "order": 1
        },
        {
          "uuid": "c2-uuid",
          "id": "C2",
          "prompt": "請描述你對未來的計畫、夢想或希望。",
          "followup": ["在你人生的下一章中，你希望能達成什麼？"],
          "coding": { "dimensions": ["動機主題（Motivational Themes）"], "keywords": ["希望", "自主性", "目標設定"] },
          "life_phase": "future",
          "conversation_role": "反思導引者（reflective_guide）",
          "response_type": "反思長答（reflective_longform）",
          "order": 2
        },
        {
          "uuid": "c3-uuid",
          "id": "C3",
          "prompt": "你目前是否正在進行，或計畫未來要進行一項人生專案？",
          "followup": [
            "那是什麼專案？你是如何開始的？",
            "這個專案可能會如何發展？",
            "為什麼這個專案對你或他人很重要？"
          ],
          "coding": { "dimensions": ["動機主題（Motivational Themes）"], "keywords": ["目的", "自主性", "投入"] },
          "life_phase": "future",
          "conversation_role": "好奇的研究者（curious_researcher）",
          "response_type": "長篇敘事（narrative_longform）",
          "order": 3
        }
      ]
    }
  ]
}

6️⃣ Reflection Rules

每一輪對話結束後，AI 在內部生成一段反思摘要（不向使用者輸出）：

歸納受訪者的主要主題（如：家庭、學業、挑戰、自我成長）。

分析回答的情感色調（positive / negative / mixed）。

連結至 JSON script 的對應章節與問題 ID。

生成下一個最自然的開放式問題。

7️⃣ Conversation Style

使用繁體中文

每次回覆不超過三句

保持溫暖、真誠、理解的語氣

不強行導向結論，優先引導自我探索

於訪談結尾時提供一段整體反思建議，例如：
「根據你的分享，看起來你在人際關係與成長經驗中找到很多意義，也許可以試著把這些故事整理成文字或作品，讓自己看見一路的轉變。」

8️⃣ Example System Output Format
{
  "memory": {
    "current_section": "B",
    "current_question_id": "B4",
    "context_summary": "童年快樂記憶，重點是與家人共度時光",
    "emotional_valence": "positive"
  },
  "reflection": {
    "core_meaning": "歸屬感與家庭連結",
    "psychological_theme": "關係導向的自我認同"
  },
  "next_question": "你覺得這段經驗在你後來的人際關係中有延續嗎？"
}
`
          },
        });
      } catch (err) {
        console.error("Failed to start live conversation:", err);
        setStatus("error");
        stopAudioProcessing();
      }
    }
  }, [id, status, stopAudioProcessing]);

  // -------------------------
  // Text mode：暫時用舊的 /transcript → 非必須
  // -------------------------
  const sendTextMessage = async () => {
    if (!textInput.trim()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: textInput,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setTextInput("");

    try {
      await fetch(`/api/session/${id}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMessage.content }),
      });
      // 這裡如果你還保留 /stream SSE，可以再接回來
      // 目前重點是 Live Audio，所以不再用 SSE 更新
    } catch (error) {
      console.error("Failed to send text:", error);
    }
  };

  // -------------------------
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isProcessing = status === "connecting";

  // -------------------------
  // JSX
  // -------------------------
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ========== Header ========== */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="text-gray-600 hover:text-black"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            <div className="h-6 w-px bg-gray-200" />

            <h1 className="text-lg font-light">
              {sessionTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/session/${id}/transcript`)
              }
            >
              <FileText className="w-4 h-4 mr-2" />
              Full Transcript
            </Button>

            <Button
              size="sm"
              onClick={() =>
                router.push(`/session/${id}/summary`)
              }
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Summary
            </Button>
          </div>
        </div>
      </header>

      {/* ========== Messages Area ========== */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {messages.length === 0 && !currentOutput ? (
            <div className="flex flex-col items-center py-20 text-center">
              <Mic className="w-8 h-8 text-gray-400 mb-4" />
              <h3 className="text-lg font-light">
                Start your interview
              </h3>
              <p className="text-sm text-gray-500">
                Press the microphone to begin
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user"
                    ? "justify-end"
                    : "justify-start"
                    }`}
                >
                  <Card
                    className={`max-w-[75%] rounded-2xl p-4 shadow-sm ${msg.role === "user"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-black border-gray-200"
                      }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {msg.content}
                    </p>
                    <p
                      className={`text-xs mt-2 ${msg.role === "user"
                        ? "text-gray-400"
                        : "text-gray-500"
                        }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </Card>
                </div>
              ))}

              {/* 當前回合尚未結束的 AI output（可選） */}
              {currentOutput && (
                <div className="flex justify-start">
                  <Card className="max-w-[75%] rounded-2xl p-4 shadow-sm bg-white text-black border-gray-200">
                    <p className="text-sm whitespace-pre-wrap">
                      {currentOutput}
                    </p>
                    <p className="text-xs mt-2 text-gray-500">
                      ...
                    </p>
                  </Card>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* ========== Input Area ========== */}
      <footer className="border-t border-gray-200 bg-white min-h-[150px]">
        <div className="max-w-4xl mx-auto px-6 py-4">
          {/* Live Voice Button */}
          <div className="flex flex-col items-center gap-3 mb-4">
            <Button
              size="lg"
              disabled={isProcessing}
              onClick={handleToggleConversation}
              className={`rounded-full w-16 h-16 shadow-lg transition-all active:scale-95 ${status === "connected"
                ? "bg-red-500 animate-pulse"
                : "bg-orange-500 hover:bg-orange-600"
                }`}
            >
              {isProcessing ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : status === "connected" ? (
                <MicOff className="w-6 h-6 text-white" />
              ) : (
                <Mic className="w-6 h-6 text-white" />
              )}
            </Button>

            <span className="text-xs text-gray-500">
              {status === "connected"
                ? "Listening... tap to stop"
                : status === "connecting"
                  ? "Connecting..."
                  : status === "error"
                    ? "Error occurred. Tap to retry"
                    : "Tap to start live interview"}
            </span>
          </div>

          {/* Text Mode：簡單版本保留（非 live） */}
          <div className="flex items-center gap-2 mt-2">
            <Input
              placeholder="Type your message (non-live)..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendTextMessage();
                }
              }}
              className="flex-1"
            />
            <Button
              onClick={sendTextMessage}
              disabled={!textInput.trim()}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              Send
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
