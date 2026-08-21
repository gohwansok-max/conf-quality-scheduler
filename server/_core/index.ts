import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { runQualityNotificationCron } from "../qualityNotificationCron";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { getCertificatesForBackup, streamCertificateBackup } from "../certificateBackup";
import { streamSharedCertificate } from "../certificateShare";
import { streamSharedHealthCertificate } from "../healthCertificateShare";
import { createInspectionStatusExport } from "../inspectionScheduleExport";
import { createManufactureHistoryExport } from "../manufactureHistoryExport";
import { getMonthlyReportDownloadUrl } from "../monthlyInspectionReport";
import { streamSharedMonthlyReport } from "../monthlyReportShare";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/quality-notifications", runQualityNotificationCron);
  app.get("/api/quality-certificates/backup", async (req, res) => {
    try {
      const rawIds = typeof req.query.ids === "string" ? req.query.ids : "all";
      const requestedIds = rawIds === "all"
        ? "all"
        : Array.from(new Set(rawIds.split(",").map(value => Number(value)).filter(Number.isInteger).filter(value => value > 0)));
      if (requestedIds !== "all" && requestedIds.length === 0) return res.status(400).json({ error: "백업할 성적서를 선택해 주세요." });
      const certificates = await getCertificatesForBackup(1, requestedIds);
      await streamCertificateBackup(res, certificates);
    } catch (error) {
      if (!res.headersSent) res.status(400).json({ error: error instanceof Error ? error.message : "성적서 백업을 만들지 못했습니다." });
      else res.destroy(error instanceof Error ? error : undefined);
    }
  });
  app.get("/api/quality-certificates/share/:certificateId", async (req, res) => {
    try {
      const certificateId = Number(req.params.certificateId);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!Number.isInteger(certificateId) || certificateId <= 0 || !token) return res.status(400).json({ error: "유효하지 않은 성적서 공유 링크입니다." });
      await streamSharedCertificate(res, certificateId, token);
    } catch (error) {
      if (!res.headersSent) res.status(400).json({ error: error instanceof Error ? error.message : "성적서를 내려받지 못했습니다." });
      else res.destroy(error instanceof Error ? error : undefined);
    }
  });
  app.get("/api/health-certificates/share/:certificateId", async (req, res) => {
    try {
      const certificateId = Number(req.params.certificateId);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!Number.isInteger(certificateId) || certificateId <= 0 || !token) return res.status(400).json({ error: "유효하지 않은 보건증 공유 링크입니다." });
      await streamSharedHealthCertificate(res, certificateId, token);
    } catch (error) {
      if (!res.headersSent) res.status(400).json({ error: error instanceof Error ? error.message : "보건증을 내려받지 못했습니다." });
      else res.destroy(error instanceof Error ? error : undefined);
    }
  });
  app.get("/api/quality-products/export.xlsx", async (req, res) => {
    try {
      const workbookBuffer = await createInspectionStatusExport(1);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
      const fileName = `koenf_quality_inspection_status_${date}.xlsx`;
      res.status(200);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"; filename*=UTF-8''${encodeURIComponent(`코엔에프_제품별_자가품질검사_현황_${date}.xlsx`)}`);
      res.setHeader("Cache-Control", "no-store");
      res.end(workbookBuffer);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "검사 현황 엑셀을 만들지 못했습니다." });
    }
  });
  app.get("/api/product-manufacture-records/export.xlsx", async (req, res) => {
    try {
      const workbookBuffer = await createManufactureHistoryExport(1);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
      const fileName = `koenf_manufacture_history_${date}.xlsx`;
      res.status(200);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(`코엔에프_제품별_제조일_변경이력_${date}.xlsx`)}`);
      res.setHeader("Cache-Control", "no-store");
      res.end(workbookBuffer);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "제조일 변경 이력 엑셀을 만들지 못했습니다." });
    }
  });
  app.get("/api/quality-reports/monthly", async (req, res) => {
    try {
      const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
      const { report, signedUrl } = await getMonthlyReportDownloadUrl(1, month);
      const file = await fetch(signedUrl);
      if (!file.ok) throw new Error("월간 보고서 파일을 읽지 못했습니다.");
      res.status(200).setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="monthly_inspection_${month}.pdf"; filename*=UTF-8''${encodeURIComponent(report.fileName)}`);
      res.setHeader("Cache-Control", "no-store");
      res.end(Buffer.from(await file.arrayBuffer()));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "월간 PDF 보고서를 만들지 못했습니다." });
    }
  });
  app.get("/api/quality-reports/share/:reportMonth", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!/^\d{4}-\d{2}$/.test(req.params.reportMonth) || !token) return res.status(400).json({ error: "유효하지 않은 월간 보고서 공유 링크입니다." });
      await streamSharedMonthlyReport(res, req.params.reportMonth, token);
    } catch (error) {
      if (!res.headersSent) res.status(400).json({ error: error instanceof Error ? error.message : "월간 보고서를 내려받지 못했습니다." });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
