import { ZipArchive } from "archiver";
import type { Response } from "express";
import { Readable } from "stream";
import * as db from "./db";
import { storageGetSignedUrl } from "./storage";

const MAX_BACKUP_FILES = 100;
const MAX_BACKUP_BYTES = 250 * 1024 * 1024;

type CertificateForBackup = Awaited<ReturnType<typeof db.listCertificates>>[number];

function archiveSafeName(value: string) {
  return value.replace(/[\\/\u0000-\u001F]/g, "_").trim() || "certificate";
}

export function buildBackupEntryName(certificate: CertificateForBackup) {
  const datePart = certificate.inspectionDate ?? "검사일미입력";
  return `${datePart}_${certificate.id}_${archiveSafeName(certificate.fileName)}`;
}

export function createZipArchive() {
  return new ZipArchive({ zlib: { level: 6 } });
}

export async function getCertificatesForBackup(ownerId: number, requestedIds: number[] | "all") {
  const allCertificates = await db.listCertificates(ownerId);
  const selected = requestedIds === "all"
    ? allCertificates
    : allCertificates.filter(certificate => requestedIds.includes(certificate.id));

  if (selected.length === 0) throw new Error("백업할 성적서가 없습니다.");
  if (selected.length > MAX_BACKUP_FILES) throw new Error(`한 번에 최대 ${MAX_BACKUP_FILES}건까지 백업할 수 있습니다.`);
  const totalBytes = selected.reduce((sum, certificate) => sum + certificate.fileSize, 0);
  if (totalBytes > MAX_BACKUP_BYTES) throw new Error("한 번에 백업할 수 있는 성적서 용량은 250MB 이하입니다.");
  return selected;
}

export async function streamCertificateBackup(res: Response, certificates: CertificateForBackup[]) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .filter(part => part.type !== "literal")
    .map(part => part.value)
    .join("");
  res.status(200);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="koenf_quality_certificates_${today}.zip"`);
  res.setHeader("Cache-Control", "no-store");

  const archive = createZipArchive();
  archive.on("warning", (error: Error & { code?: string }) => {
    if (error.code !== "ENOENT") archive.emit("error", error);
  });
  archive.on("error", (error: Error) => res.destroy(error));
  archive.pipe(res);

  for (const certificate of certificates) {
    const signedUrl = await storageGetSignedUrl(certificate.storageKey);
    const fileResponse = await fetch(signedUrl);
    if (!fileResponse.ok || !fileResponse.body) throw new Error(`성적서 파일을 읽지 못했습니다: ${certificate.fileName}`);
    archive.append(Readable.fromWeb(fileResponse.body as import("stream/web").ReadableStream), { name: buildBackupEntryName(certificate) });
  }

  await archive.finalize();
}
