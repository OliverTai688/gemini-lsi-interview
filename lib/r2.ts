// Cloudflare R2（S3 相容）— 只在 server 端使用
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL = 60 * 10; // 10 分鐘
const READ_URL_TTL = 60 * 60; // 1 小時

let client: S3Client | null = null;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function r2() {
  if (!client) {
    // R2_ENDPOINT：本機開發改接 MinIO 之類的 S3 相容服務時才需要設
    const localEndpoint = process.env.R2_ENDPOINT;
    client = new S3Client({
      region: "auto",
      endpoint:
        localEndpoint ??
        `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      forcePathStyle: !!localEndpoint,
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
      // 新版 AWS SDK 預設會加 CRC32 checksum，R2 的預簽網址不吃
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

const bucket = () => env("R2_BUCKET");

/** 瀏覽器直傳用的預簽 PUT 網址（上傳時 Content-Type 必須一致） */
export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL }
  );
}

/** 短效讀取網址；filename 有給的話會變成下載 */
export function presignRead(key: string, filename?: string) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: filename
        ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        : undefined,
    }),
    { expiresIn: READ_URL_TTL }
  );
}

/** 物件存在 → 回傳大小；不存在 → null */
export async function headObject(key: string) {
  try {
    const res = await r2().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    );
    return { sizeBytes: res.ContentLength ?? 0 };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

/** 伺服器端直接下載整個物件 */
export async function getObjectBytes(key: string) {
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`R2 object has no body: ${key}`);
  return Buffer.from(await res.Body.transformToByteArray());
}

/** 伺服器端直接上傳 */
export async function putObject(key: string, body: Buffer, contentType: string) {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteObjects(keys: string[]) {
  // DeleteObjects 一次最多 1000 個
  for (let i = 0; i < keys.length; i += 1000) {
    const res = await r2().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: {
          Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
    if (res.Errors?.length) {
      throw new Error(
        `R2 delete failed: ${res.Errors[0].Key} ${res.Errors[0].Message}`
      );
    }
  }
}
