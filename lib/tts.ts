export async function textToSpeech(text: string, apiKey: string) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        // 關鍵：要語音輸出
        generationConfig: {
          responseModalities: ["AUDIO"],
          audioFormat: "wav",
          sampleRateHertz: 24000,
        },
      }),
    }
  );

  const data = await res.json();
  const base64Audio = data?.candidates?.[0]?.audio?.audioData;
  if (!base64Audio) throw new Error("TTS failed");

  // Base64 → Blob
  const binary = atob(base64Audio);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: "audio/wav" });
}
