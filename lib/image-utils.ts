// 瀏覽器端：把畫面 / 圖片縮小成 JPEG base64（不含 data: 前綴），用來送給 Gemini Live

export function toJpegBase64(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  quality = 0.6
): string {
  const scale = Math.min(1, maxWidth / srcWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(srcWidth * scale);
  canvas.height = Math.round(srcHeight * scale);

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}
