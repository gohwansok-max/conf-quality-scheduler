import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import { ENV } from "./_core/env";
import { getMonthlyReport } from "./db";
import { storageGetSignedUrl } from "./storage";

const secret = new TextEncoder().encode(ENV.cookieSecret);
const baseUrl = process.env.PUBLIC_APP_URL ?? "https://koenfsched-igvqjfhh.manus.space";

export async function createMonthlyReportShareUrl(ownerId: number, reportMonth: string) {
  const token = await new SignJWT({ ownerId, reportMonth, kind: "monthly-inspection-report" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);
  return `${baseUrl}/api/quality-reports/share/${encodeURIComponent(reportMonth)}?token=${encodeURIComponent(token)}`;
}

export async function streamSharedMonthlyReport(res: Response, reportMonth: string, token: string) {
  const { payload } = await jwtVerify(token, secret);
  if (payload.kind !== "monthly-inspection-report" || typeof payload.ownerId !== "number" || payload.reportMonth !== reportMonth) throw new Error("유효하지 않거나 만료된 월간 보고서 공유 링크입니다.");
  const report = await getMonthlyReport(payload.ownerId, reportMonth);
  if (!report) throw new Error("월간 보고서를 찾을 수 없습니다.");
  const signedUrl = await storageGetSignedUrl(report.storageKey);
  const file = await fetch(signedUrl);
  if (!file.ok || !file.body) throw new Error("월간 보고서 파일을 읽지 못했습니다.");
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="monthly_inspection_${reportMonth}.pdf"; filename*=UTF-8''${encodeURIComponent(report.fileName)}`);
  res.setHeader("Cache-Control", "no-store");
  const buffer = Buffer.from(await file.arrayBuffer());
  res.end(buffer);
}
