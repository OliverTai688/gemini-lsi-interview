// 瀏覽器端：語音訪談的音訊引擎
//
// 整個頁面只用一個 AudioContext（裝置原生的取樣率），收音、播放、錄音混音都在裡面：
//   麥克風 ──┬─▶ 降到 16kHz ─▶ onChunk（送給 Gemini）
//            └─▶ 錄音混音
//   AI 語音（24kHz PCM）─┬─▶ 喇叭
//                        └─▶ 錄音混音
//
// 為什麼這樣設計：
// - iOS Safari 只允許在使用者點擊的當下啟動音訊 → prime() 必須在點擊事件裡同步呼叫
// - Safari 對「取樣率和裝置不同的 AudioContext」支援不穩 → 不指定取樣率，自己重新取樣
// - 接電話、切換 App 之後系統會暫停音訊 → resumeIfNeeded()

import { decode } from "@/lib/audio-utils";

const MIC_SAMPLE_RATE = 16000; // Gemini Live 要的輸入格式
const AI_SAMPLE_RATE = 24000; // Gemini Live 回傳的格式
const PROCESSOR_BUFFER = 4096;

/** 把 PCM 降到較低的取樣率（每一格取對應區間的平均） */
export function downsample(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  if (inputRate <= outputRate) return input;

  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = sum / (end - start);
  }
  return output;
}

export class LiveAudioEngine {
  private ctx: AudioContext | null = null;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silencer: GainNode | null = null;

  private mixDestination: MediaStreamAudioDestinationNode | null = null;

  private playing = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  /**
   * 啟動（或喚醒）AudioContext。
   * 一定要在使用者點擊的當下同步呼叫；之後自動重連時再呼叫也安全（沿用同一個）。
   */
  prime() {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
    }
    const ctx = this.ctx;

    if (ctx.state !== "running") void ctx.resume().catch(() => {});

    // 舊版 iOS 需要在點擊當下真的播過聲音才算解鎖 → 播一格無聲
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    unlock.connect(ctx.destination);
    unlock.start(0);

    return ctx;
  }

  /** 切回前景、或系統中斷之後呼叫 */
  resumeIfNeeded() {
    if (this.ctx && this.ctx.state !== "running" && this.ctx.state !== "closed") {
      void this.ctx.resume().catch(() => {});
    }
  }

  /** 開始一段連線：回傳錄音用的混音 stream（麥克風 + AI 語音） */
  begin(): MediaStream {
    const ctx = this.prime();
    this.nextStartTime = 0;
    this.mixDestination = ctx.createMediaStreamDestination();
    return this.mixDestination.stream;
  }

  /** 接上麥克風；每收到一段就以 16kHz PCM 交給 onChunk */
  attachMic(stream: MediaStream, onChunk: (pcm16k: Float32Array) => void) {
    const ctx = this.prime();

    this.micStream = stream;
    this.micSource = ctx.createMediaStreamSource(stream);
    if (this.mixDestination) this.micSource.connect(this.mixDestination);

    this.processor = ctx.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);
    this.processor.onaudioprocess = (e) => {
      onChunk(
        downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate, MIC_SAMPLE_RATE)
      );
    };

    // ScriptProcessor 要接到輸出才會運作；中間擋一個音量 0，避免麥克風的聲音從喇叭出來
    this.silencer = ctx.createGain();
    this.silencer.gain.value = 0;
    this.micSource.connect(this.processor);
    this.processor.connect(this.silencer);
    this.silencer.connect(ctx.destination);
  }

  /** 播放 AI 回傳的一段語音（base64 的 16-bit PCM），接在上一段後面 */
  play(base64: string) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;

    const bytes = decode(base64);
    const samples = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / 2)
    );
    if (samples.length === 0) return;

    // buffer 用 AI 的取樣率建立，播放時瀏覽器會自動轉成裝置的取樣率
    const buffer = ctx.createBuffer(1, samples.length, AI_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    if (this.mixDestination) source.connect(this.mixDestination);
    source.addEventListener("ended", () => this.playing.delete(source));

    this.nextStartTime = Math.max(this.nextStartTime, ctx.currentTime);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this.playing.add(source);
  }

  /** AI 被打斷：停掉還沒播完的語音 */
  interrupt() {
    this.playing.forEach((source) => {
      try {
        source.stop();
      } catch {
        // 已經播完的不用管
      }
    });
    this.playing.clear();
    this.nextStartTime = 0;
  }

  /** 結束這一段連線：關麥克風、停止播放。AudioContext 留著，下次（含自動重連）繼續用 */
  end() {
    this.interrupt();

    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.silencer?.disconnect();
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((track) => track.stop());

    this.processor = null;
    this.silencer = null;
    this.micSource = null;
    this.micStream = null;
    this.mixDestination = null;
  }

  /** 離開頁面 */
  dispose() {
    this.end();
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
