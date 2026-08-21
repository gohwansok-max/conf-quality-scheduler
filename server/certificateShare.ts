import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import { Readable } from "stream";
import { ENV } from "./_core/env";
import * as db from "./db";
import { storageGetSignedUrl } from "./storage";

const TOKEN_LIFETIME = "7d";
const PUBLIC_APP_ORIGIN = (process.env.QUALITY_SCHEDULER_PUBLIC_URL || "https://confsched-igvqjfhh.manus.space").replace(/\/$/, "");

function tokenKey() {
  if (!ENV.cookieSecret) throw new Error("공유 링크 보안 설정을 찾을 수 없습니다.");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function safeDownloadName(value: string) {
  const suffix = value.toLowerCase().match(/\.(pdf|xls|xlsx|jpg|jpeg|png)$/)?.[1] ?? "bin";
  return `quality_certificate.${suffix}`;
}

export async function createCertificateShareUrl(ownerId: number, certificateId: number) {
  const token = await new SignJWT({ ownerId, certificateId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(tokenKey());
  return `${PUBLIC_APP_ORIGIN}/api/quality-certificates/share/${certificateId}?token=${encodeURIComponent(token)}`;
}

export async function streamSharedCertificate(res: Response, certificateId: number, token: string) {
  const { payload } = await jwtVerify(token, tokenKey());
  if (payload.certificateId !== certificateId || typeof payload.ownerId !== "number") throw new Error("유효하지 않은 성적서 공유 링크입니다.");
  const certificate = (await db.listCertificates(payload.ownerId)).find(item => item.id === certificateId);
  if (!certificate) throw new Error("성적서를 찾을 수 없거나 공유 링크가 만료되었습니다.");
  const signedUrl = await storageGetSignedUrl(certificate.storageKey);
  const source = await fetch(signedUrl);
  if (!source.ok || !source.body) throw new Error("성적서 파일을 불러오지 못했습니다.");

  res.status(200);
  res.setHeader("Content-Type", certificate.contentType);
  res.setHeader("Content-Disposition", `attachment; filename=\"${safeDownloadName(certificate.fileName)}\"; filename*=UTF-8''${encodeURIComponent(certificate.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  Readable.fromWeb(source.body as import("stream/web").ReadableStream).pipe(res);
}
