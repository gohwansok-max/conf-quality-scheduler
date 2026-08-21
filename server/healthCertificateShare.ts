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

export async function createHealthCertificateShareUrl(ownerId: number, healthCertificateId: number) {
  const token = await new SignJWT({ ownerId, healthCertificateId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(tokenKey());
  return `${PUBLIC_APP_ORIGIN}/api/health-certificates/share/${healthCertificateId}?token=${encodeURIComponent(token)}`;
}

export async function streamSharedHealthCertificate(res: Response, healthCertificateId: number, token: string) {
  const { payload } = await jwtVerify(token, tokenKey());
  if (payload.healthCertificateId !== healthCertificateId || typeof payload.ownerId !== "number") throw new Error("유효하지 않은 보건증 공유 링크입니다.");
  const certificate = await db.getHealthCertificate(payload.ownerId, healthCertificateId);
  if (!certificate?.storageKey || !certificate.fileName || !certificate.contentType) throw new Error("보건증을 찾을 수 없거나 공유 링크가 만료되었습니다.");
  const signedUrl = await storageGetSignedUrl(certificate.storageKey);
  const source = await fetch(signedUrl);
  if (!source.ok || !source.body) throw new Error("보건증 PDF를 불러오지 못했습니다.");
  res.status(200);
  res.setHeader("Content-Type", certificate.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="health_certificate.pdf"; filename*=UTF-8''${encodeURIComponent(certificate.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  Readable.fromWeb(source.body as import("stream/web").ReadableStream).pipe(res);
}
