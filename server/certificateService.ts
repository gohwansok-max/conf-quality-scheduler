import { storageGet, storagePut } from "./storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);

function displayFilename(value: string) {
  return value.replace(/[\\/\u0000-\u001F]/g, "_").trim().slice(0, 180) || "certificate";
}

export function buildAsciiStorageFilename(value: string) {
  const suffix = value.toLowerCase().match(/\.(pdf|xls|xlsx|jpg|jpeg|png)$/)?.[1] ?? "bin";
  return `certificate_${crypto.randomUUID().replaceAll("-", "")}.${suffix}`;
}

export function decodeCertificateUpload(fileBase64: string, fileName: string, contentType: string) {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new Error("PDF, Excel, JPG, PNG 파일만 업로드할 수 있습니다.");
  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length === 0) throw new Error("업로드할 파일이 비어 있습니다.");
  if (buffer.length > MAX_FILE_SIZE) throw new Error("파일은 20MB 이하만 업로드할 수 있습니다.");
  return { buffer, fileName: displayFilename(fileName), contentType };
}

export async function storeCertificateFile(input: { ownerId: number; inspectionTypeId: number; fileName: string; buffer: Buffer; contentType: string }) {
  return storagePut(
    `quality-certificates/${input.ownerId}/${input.inspectionTypeId}/${buildAsciiStorageFilename(input.fileName)}`,
    input.buffer,
    input.contentType
  );
}

export async function getCertificateDownloadUrl(storageKey: string) {
  return storageGet(storageKey);
}
