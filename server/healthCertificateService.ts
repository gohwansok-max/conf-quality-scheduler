import crypto from "crypto";
import { storageGet, storagePut } from "./storage";

const PDF_CONTENT_TYPE = "application/pdf";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function safeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim().slice(0, 255) || "health_certificate.pdf";
}

export function decodeHealthCertificatePdf(fileBase64: string, fileName: string, contentType: string) {
  if (contentType.toLowerCase() !== PDF_CONTENT_TYPE || !fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("보건증은 PDF 파일만 업로드할 수 있습니다.");
  }
  const encoded = fileBase64.replace(/^data:application\/pdf;base64,/, "");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_PDF_BYTES || buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Error("유효한 20MB 이하 PDF 파일을 업로드해 주세요.");
  }
  return { buffer, fileName: safeFileName(fileName), contentType: PDF_CONTENT_TYPE };
}

export async function storeHealthCertificatePdf(input: { ownerId: number; healthCertificateId: number; buffer: Buffer; fileName: string }) {
  const storageKey = `health-certificates/${input.ownerId}/${input.healthCertificateId}/health_certificate_${crypto.randomUUID()}.pdf`;
  const stored = await storagePut(storageKey, input.buffer, PDF_CONTENT_TYPE);
  return { storageKey: stored.key, fileName: input.fileName, contentType: PDF_CONTENT_TYPE, fileSize: input.buffer.length };
}

export async function getHealthCertificateDownloadUrl(storageKey: string) {
  return storageGet(storageKey);
}
