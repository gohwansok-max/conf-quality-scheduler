import { parse as parseCookie } from "cookie";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { COOKIE_NAME } from "../shared/const";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { buildInspectionSchedule, buildProductSchedule, kstDateString } from "./qualityScheduleCore";
import { buildDailyCron, buildDailyCronAtKst, findTelegramGroups, sendQualityNotification } from "./qualityNotificationService";
import { decodeCertificateUpload, getCertificateDownloadUrl, storeCertificateFile } from "./certificateService";
import { ensureMonthlyInspectionReport } from "./monthlyInspectionReport";
import { createMonthlyReportShareUrl } from "./monthlyReportShare";
import { protectedProcedure, router } from "./_core/trpc";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const telegramRecipientScopes = z.array(z.object({ scopeType: z.enum(["inspection_type", "product"]), scopeId: z.number().int().positive() })).min(1).max(100);

function toPublicSettings(settings: Awaited<ReturnType<typeof db.getNotificationSettings>>) {
  return {
    ...settings,
    telegramConfigured: Boolean(settings.telegramChatId),
    automationConfigured: Boolean(settings.scheduleCronTaskUid && settings.isScheduleEnabled),
  };
}

export const qualitySchedulerRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const [items, settings, logs, products, certificates, alertTimes, manufactureRecords, certificateNumberRule, telegramRecipients] = await Promise.all([
      db.listInspectionTypes(ctx.user.id),
      db.getNotificationSettings(ctx.user.id),
      db.listNotificationLogs(ctx.user.id),
      db.listProducts(ctx.user.id),
      db.listCertificates(ctx.user.id),
      db.listNotificationTimeSlots(ctx.user.id),
      db.listProductManufactureRecords(ctx.user.id),
      db.getCertificateNumberRule(ctx.user.id),
      db.listTelegramRecipients(ctx.user.id),
    ]);
    const typeById = new Map(items.map(item => [item.id, item]));
    const productSchedules = products.map(product => {
      const parent = typeById.get(product.inspectionTypeId);
      const parentStopped = !parent || !parent.isActive || parent.productionStatus === "stopped";
      const parentPaused = !parent || parent.alertStatus === "paused";
      return buildProductSchedule({
        ...product,
        parentTypeName: parent?.name ?? "식품유형 미지정",
        productionStatus: parentStopped ? "stopped" : product.productionStatus,
        alertStatus: parentPaused ? "paused" : product.alertStatus,
      }, settings.warningDays);
    });
    return {
      schedules: items.map(item => buildInspectionSchedule(item, settings.warningDays)),
      productSchedules,
      settings: toPublicSettings(settings),
      alertTimes,
      logs,
      products,
      manufactureRecords,
      certificateNumberRule,
      telegramRecipients,
      certificates: await Promise.all(certificates.map(async certificate => ({
        ...certificate,
        downloadUrl: (await getCertificateDownloadUrl(certificate.storageKey)).url,
      }))),
    };
  }),

  createInspectionType: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      intervalMonths: z.number().int().min(1).max(36),
      lastManufactureDate: isoDate.optional(),
      testItems: z.string().trim().min(1).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createInspectionType(ctx.user.id, input);
      return { id };
    }),

  updateInspectionType: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(120).optional(),
      intervalMonths: z.number().int().min(1).max(36).optional(),
      lastManufactureDate: isoDate.optional(),
      testItems: z.string().trim().min(1).max(4000).optional(),
      isActive: z.boolean().optional(),
      productionStatus: z.enum(["active", "stopped"]).optional(),
      productionStoppedAt: isoDate.optional(),
      productionStopReason: z.string().trim().max(1000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      try {
        return await db.updateInspectionType(ctx.user.id, id, changes);
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "검사 유형을 찾을 수 없습니다." });
      }
    }),

  createProduct: protectedProcedure
    .input(z.object({
      inspectionTypeId: z.number().int().positive(),
      name: z.string().trim().min(1).max(180),
      intervalMonths: z.number().int().min(1).max(36).default(2),
      lastManufactureDate: isoDate.optional(),
    }))
    .mutation(async ({ ctx, input }) => ({ id: await db.createProduct(ctx.user.id, input) })),

  updateProduct: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      intervalMonths: z.number().int().min(1).max(36).optional(),
      lastManufactureDate: isoDate.optional(),
      manufactureMemo: z.string().trim().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, lastManufactureDate, manufactureMemo, ...changes } = input;
      if (Object.keys(changes).length) await db.updateProduct(ctx.user.id, id, changes);
      if (lastManufactureDate) return db.recordProductManufactureDate(ctx.user.id, { productId: id, manufactureDate: lastManufactureDate, memo: manufactureMemo });
      if (lastManufactureDate === null) return db.updateProduct(ctx.user.id, id, { lastManufactureDate: null });
      return db.updateProduct(ctx.user.id, id, {});
    }),

  recordManufactureDates: protectedProcedure
    .input(z.object({ entries: z.array(z.object({ productId: z.number().int().positive(), manufactureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), memo: z.string().trim().max(500).nullable().optional() })).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => db.recordProductManufactureDates(ctx.user.id, input.entries)),

  setProductAlertPause: protectedProcedure
    .input(z.object({
      productId: z.number().int().positive(),
      paused: z.boolean(),
      reason: z.string().trim().max(1000).optional(),
    }).refine(input => !input.paused || Boolean(input.reason), { message: "제품 알림 일시 중지 사유를 입력해 주세요.", path: ["reason"] }))
    .mutation(async ({ ctx, input }) => db.updateProduct(ctx.user.id, input.productId, input.paused ? {
      alertStatus: "paused",
      alertPausedAt: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
      alertPauseReason: input.reason ?? null,
    } : {
      alertStatus: "active",
      alertPausedAt: null,
      alertPauseReason: null,
    })),

  setProductProduction: protectedProcedure
    .input(z.object({
      productId: z.number().int().positive(),
      stopped: z.boolean(),
      reason: z.string().trim().max(1000).optional(),
    }).refine(input => !input.stopped || Boolean(input.reason), { message: "제품 생산 중단 사유를 입력해 주세요.", path: ["reason"] }))
    .mutation(async ({ ctx, input }) => db.updateProduct(ctx.user.id, input.productId, input.stopped ? {
      productionStatus: "stopped",
      productionStoppedAt: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
      productionStopReason: input.reason ?? null,
    } : {
      productionStatus: "active",
      productionStoppedAt: null,
      productionStopReason: null,
      alertStatus: "active",
      alertPausedAt: null,
      alertPauseReason: null,
    })),

  stopProduction: protectedProcedure
    .input(z.object({
      inspectionTypeId: z.number().int().positive(),
      stoppedAt: isoDate.optional(),
      reason: z.string().trim().min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const stoppedAt = input.stoppedAt ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
      return db.updateInspectionType(ctx.user.id, input.inspectionTypeId, {
        productionStatus: "stopped",
        productionStoppedAt: stoppedAt,
        productionStopReason: input.reason,
      });
    }),

  resumeProduction: protectedProcedure
    .input(z.object({ inspectionTypeId: z.number().int().positive(), lastManufactureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ ctx, input }) => db.updateInspectionType(ctx.user.id, input.inspectionTypeId, {
      productionStatus: "active",
      productionStoppedAt: null,
      productionStopReason: null,
      alertStatus: "active",
      alertPausedAt: null,
      alertPauseReason: null,
      lastManufactureDate: input.lastManufactureDate,
    })),

  setInspectionAlertPause: protectedProcedure
    .input(z.object({
      inspectionTypeId: z.number().int().positive(),
      paused: z.boolean(),
      reason: z.string().trim().max(1000).optional(),
    }).refine(input => !input.paused || Boolean(input.reason), { message: "알림 일시 중지 사유를 입력해 주세요.", path: ["reason"] }))
    .mutation(async ({ ctx, input }) => db.updateInspectionType(ctx.user.id, input.inspectionTypeId, input.paused ? {
      alertStatus: "paused",
      alertPausedAt: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
      alertPauseReason: input.reason ?? null,
    } : {
      alertStatus: "active",
      alertPausedAt: null,
      alertPauseReason: null,
    })),

  uploadCertificate: protectedProcedure
    .input(z.object({
      inspectionTypeId: z.number().int().positive(),
      productId: z.number().int().positive().nullable().optional(),
      certificateNumber: z.string().trim().max(120).nullable().optional(),
      useStandardNumber: z.boolean().default(true),
      inspectionDate: isoDate.optional(),
      fileName: z.string().trim().min(1).max(255),
      contentType: z.string().trim().min(1).max(120),
      fileBase64: z.string().min(1).max(28_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      const decoded = decodeCertificateUpload(input.fileBase64, input.fileName, input.contentType);
      const stored = await storeCertificateFile({
        ownerId: ctx.user.id,
        inspectionTypeId: input.inspectionTypeId,
        fileName: decoded.fileName,
        buffer: decoded.buffer,
        contentType: decoded.contentType,
      });
      const issueDate = input.inspectionDate ?? kstDateString();
      const certificateNumber = input.useStandardNumber ? await db.issueCertificateNumber(ctx.user.id, issueDate) : input.certificateNumber ?? null;
      const id = await db.createCertificate(ctx.user.id, {
        inspectionTypeId: input.inspectionTypeId,
        productId: input.productId ?? null,
        certificateNumber,
        inspectionDate: input.inspectionDate ?? null,
        fileName: decoded.fileName,
        storageKey: stored.key,
        contentType: decoded.contentType,
        fileSize: decoded.buffer.length,
      });
      return { id, certificateNumber, downloadUrl: stored.url };
    }),

  suggestCertificateNumber: protectedProcedure
    .input(z.object({ inspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
    .query(async ({ ctx, input }) => db.suggestCertificateNumber(ctx.user.id, input.inspectionDate ?? kstDateString())),

  updateCertificateNumberRule: protectedProcedure
    .input(z.object({ prefix: z.string().trim().min(1).max(40), sequenceDigits: z.number().int().min(2).max(6) }))
    .mutation(async ({ ctx, input }) => db.updateCertificateNumberRule(ctx.user.id, input)),

  updateSettings: protectedProcedure
    .input(z.object({
      warningDays: z.number().int().min(1).max(90).optional(),
      alertHourKst: z.number().int().min(0).max(23).optional(),
      telegramChatId: z.string().regex(/^-?\d+$/).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const settings = await db.updateNotificationSettings(ctx.user.id, input);
      return toPublicSettings(settings);
    }),

  setGlobalAlertPause: protectedProcedure
    .input(z.object({
      paused: z.boolean(),
      reason: z.string().trim().max(1000).optional(),
    }).refine(input => !input.paused || Boolean(input.reason), { message: "전체 알림 일시 중지 사유를 입력해 주세요.", path: ["reason"] }))
    .mutation(async ({ ctx, input }) => toPublicSettings(await db.updateNotificationSettings(ctx.user.id, input.paused ? {
      isAlertPaused: true,
      alertPausedAt: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
      alertPauseReason: input.reason ?? null,
    } : {
      isAlertPaused: false,
      alertPausedAt: null,
      alertPauseReason: null,
    }))),

  detectTelegramGroups: protectedProcedure.query(async () => findTelegramGroups()),

  connectTelegramGroup: protectedProcedure
    .input(z.object({ chatId: z.string().regex(/^-?\d+$/) }))
    .mutation(async ({ ctx, input }) => toPublicSettings(await db.updateNotificationSettings(ctx.user.id, { telegramChatId: input.chatId }))),

  createTelegramRecipient: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100), telegramChatId: z.string().regex(/^-?\d+$/), isActive: z.boolean().default(true), receivesHealthAlerts: z.boolean().default(true), scopes: telegramRecipientScopes }))
    .mutation(async ({ ctx, input }) => ({ id: await db.createTelegramRecipient(ctx.user.id, input) })),

  updateTelegramRecipient: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(100).optional(), telegramChatId: z.string().regex(/^-?\d+$/).optional(), isActive: z.boolean().optional(), receivesHealthAlerts: z.boolean().optional(), scopes: telegramRecipientScopes.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      await db.updateTelegramRecipient(ctx.user.id, id, changes);
      return { id };
    }),

  deleteTelegramRecipient: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => db.deleteTelegramRecipient(ctx.user.id, input.id)),

  sendTestNotification: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getNotificationSettings(ctx.user.id);
    const result = await sendQualityNotification(settings, { force: true, isTest: true });
    return result;
  }),

  generateMonthlyReport: protectedProcedure
    .input(z.object({ reportMonth: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ensureMonthlyInspectionReport(ctx.user.id, input.reportMonth);
      return { report, downloadUrl: await createMonthlyReportShareUrl(ctx.user.id, report.reportMonth) };
    }),

  setAutomation: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const settings = await db.getNotificationSettings(ctx.user.id);
      if (input.enabled && !settings.telegramChatId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "텔레그램 알림 그룹을 먼저 연결해 주세요." });
      }
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const cron = buildDailyCron(settings.alertHourKst);
      let taskUid = settings.scheduleCronTaskUid;

      if (input.enabled && !taskUid) {
        const created = await createHeartbeatJob({
          name: `quality-notifications-${ctx.user.id}`,
          cron,
          path: "/api/scheduled/quality-notifications",
          description: "자가품질검사 검사 임박 및 기간 초과 텔레그램 알림",
        }, sessionToken);
        taskUid = created.taskUid;
      } else if (taskUid) {
        await updateHeartbeatJob(taskUid, { cron, enable: input.enabled }, sessionToken);
      }

      return toPublicSettings(await db.updateNotificationSettings(ctx.user.id, {
        scheduleCronTaskUid: taskUid,
        isScheduleEnabled: input.enabled,
      }));
    }),

  setAutomationSchedule: protectedProcedure
    .input(z.object({ enabled: z.boolean(), times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const times = Array.from(new Set(input.times)).sort();
      const settings = await db.getNotificationSettings(ctx.user.id);
      if (input.enabled && !settings.telegramChatId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "텔레그램 알림 그룹을 먼저 연결해 주세요." });
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      let slots = await db.listNotificationTimeSlots(ctx.user.id);
      if (slots.length === 0 && settings.scheduleCronTaskUid) {
        const legacyTime = `${settings.alertHourKst.toString().padStart(2, "0")}:00`;
        await db.createNotificationTimeSlot(ctx.user.id, { timeKst: legacyTime, scheduleCronTaskUid: settings.scheduleCronTaskUid, isActive: settings.isScheduleEnabled });
        slots = await db.listNotificationTimeSlots(ctx.user.id);
      }
      for (const slot of slots.filter(slot => !times.includes(slot.timeKst))) {
        if (slot.scheduleCronTaskUid) await deleteHeartbeatJob(slot.scheduleCronTaskUid, sessionToken);
        await db.deleteNotificationTimeSlot(ctx.user.id, slot.id);
      }
      const byTime = new Map((await db.listNotificationTimeSlots(ctx.user.id)).map(slot => [slot.timeKst, slot]));
      for (const timeKst of times) {
        const cron = buildDailyCronAtKst(timeKst);
        const slot = byTime.get(timeKst);
        if (slot?.scheduleCronTaskUid) {
          await updateHeartbeatJob(slot.scheduleCronTaskUid, { cron, enable: input.enabled, description: `자가품질검사 텔레그램 알림 (${timeKst} KST)` }, sessionToken);
          await db.updateNotificationTimeSlot(ctx.user.id, slot.id, { isActive: input.enabled });
        } else {
          if (!input.enabled) {
            await db.createNotificationTimeSlot(ctx.user.id, { timeKst, isActive: false });
            continue;
          }
          const created = await createHeartbeatJob({ name: `quality-notifications-${ctx.user.id}-${timeKst.replace(":", "")}`, cron, path: "/api/scheduled/quality-notifications", description: `자가품질검사 텔레그램 알림 (${timeKst} KST)` }, sessionToken);
          await db.createNotificationTimeSlot(ctx.user.id, { timeKst, scheduleCronTaskUid: created.taskUid, isActive: input.enabled });
        }
      }
      const savedSlots = await db.listNotificationTimeSlots(ctx.user.id);
      const firstSlot = savedSlots[0];
      const updated = await db.updateNotificationSettings(ctx.user.id, { alertHourKst: Number((firstSlot?.timeKst ?? "09:00").slice(0, 2)), scheduleCronTaskUid: firstSlot?.scheduleCronTaskUid ?? null, isScheduleEnabled: input.enabled });
      return { settings: toPublicSettings(updated), alertTimes: savedSlots };
    }),
});
