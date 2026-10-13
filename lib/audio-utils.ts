// src/lib/audio-utils.ts
// 工具：處理 PCM ↔ base64 以及解碼成 AudioBuffer（瀏覽器端）

import { Blob as GenAIBlob } from "@google/genai";

// 簡易版 base64 encode/decode（瀏覽器可用 btoa / atob）
export function encode(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// 把 Float32 PCM 轉成 Gemini 需要的 Blob 格式（audio/pcm）
export function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // clamp
    let s = data[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    int16[i] = s * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    // 🔴 這裡使用 16k 當 input rate（官方推薦），
    // 你選的 24k 用在「輸出語音播放」品質上
    mimeType: "audio/pcm;rate=16000",
  };
}
