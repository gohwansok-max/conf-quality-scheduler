import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import {
  addMonthsToDate,
  buildHealthCertificateSchedule,
} from "./healthCertificateCore";
import {
  decodeHealthCertificatePdf,
  getHealthCertificateDownloadUrl,
  storeHealthCertificatePdf,
} from "./healthCertificateService";
import { createHealthCertificateShareUrl } from "./healthCertificateShare";
import { sendHealthCertificateNotification } from "./healthCertificateNotificationService";
import { kstDateString } from "./qualityScheduleCore";
import { protectedProcedure, router } from "./_core/trpc";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.string().trim().max(1000).nullable().optional();
const healthCreateInput = z.object({
  employeeName: z.string().trim().min(1).max(120),
  department: z.string().trim().max(120).nullable().optional(),
  issuedAt: isoDate,
  expiresAt: isoDate.optional(),
  validityMonths: z.number().int().min(1).max(36).default(12),
  warningDays: z.number().int().min(1).max(180).default(30),
  memo: optionalText,
});
const healthUpdateInput = z.object({
  employeeName: z.string().trim().min(1).max(120).optional(),
  department: z.string().trim().max(120).nullable().optional(),
  issuedAt: isoDate.optional(),
  expiresAt: isoDate.nullable().optional(),
  validityMonths: z.number().int().min(1).max(36).optional(),
  warningDays: z.number().int().min(1).max(180).optional(),
  memo: optionalText,
});

export const healthCertificateRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const [certificates, logs, settings] = await Promise.all([
      db.listHealthCertificates(ctx.user.id),
      db.listHealthCertificateNotificationLogs(ctx.user.id),
      db.getNotificationSettings(ctx.user.id),
    ]);
    const referenceDate = kstDateString();
    const schedules = await Promise.all(
      certificates.map(async certificate => ({
        ...buildHealthCertificateSchedule(certificate, referenceDate),
        downloadUrl: certificate.storageKey
          ? (await getHealthCertificateDownloadUrl(certificate.storageKey)).url
          : null,
        shareUrl: certificate.storageKey
          ? await createHealthCertificateShareUrl(ctx.user.id, certificate.id)
          : null,
      }))
    );
    return {
      schedules,
      logs,
      referenceDate,
      telegramConfigured: Boolean(settings.telegramChatId),
    };
  }),

  create: protectedProcedure
    .input(healthCreateInput)
    .mutation(async ({ ctx, input }) => {
      const expiresAt =
        input.expiresAt ??
        addMonthsToDate(input.issuedAt, input.validityMonths);
      if (expiresAt < input.issuedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "만료일은 발급일 이후로 입력해 주세요.",
        });
      }
      try {
        return {
          id: await db.createHealthCertificate(ctx.user.id, {
            ...input,
            expiresAt,
          }),
        };
      } catch (error) {
        const message = String(error).toLowerCase();
        if (message.includes("unique") || message.includes("duplicate"))
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "동일한 담당자명이 이미 등록되어 있습니다. 기존 항목을 수정해 주세요.",
          });
        throw error;
      }
    }),

  update: protectedProcedure
    .input(
      z.object({ id: z.number().int().positive() }).merge(healthUpdateInput)
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expiresAt: requestedExpiresAt, ...changes } = input;
      const current = await db.getHealthCertificate(ctx.user.id, id);
      if (!current)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "보건증 관리 항목을 찾을 수 없습니다.",
        });
      const issuedAt = changes.issuedAt ?? current.issuedAt;
      const validityMonths = changes.validityMonths ?? current.validityMonths;
      const expiresAt =
        requestedExpiresAt === null
          ? addMonthsToDate(issuedAt, validityMonths)
          : (requestedExpiresAt ??
            (changes.issuedAt || changes.validityMonths
              ? addMonthsToDate(issuedAt, validityMonths)
              : undefined));
      if ((expiresAt ?? current.expiresAt) < issuedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "만료일은 발급일 이후로 입력해 주세요.",
        });
      }
      try {
        return await db.updateHealthCertificate(ctx.user.id, id, {
          ...changes,
          ...(expiresAt ? { expiresAt } : {}),
        });
      } catch (error) {
        if (String(error).toLowerCase().includes("duplicate")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "동일한 담당자명이 이미 등록되어 있습니다.",
          });
        }
        throw error;
      }
    }),

  uploadPdf: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(255),
        contentType: z.string().trim().min(1).max(120),
        fileBase64: z.string().min(1).max(28_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const certificate = await db.getHealthCertificate(ctx.user.id, input.id);
      if (!certificate)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "보건증 관리 항목을 찾을 수 없습니다.",
        });
      const decoded = decodeHealthCertificatePdf(
        input.fileBase64,
        input.fileName,
        input.contentType
      );
      const stored = await storeHealthCertificatePdf({
        ownerId: ctx.user.id,
        healthCertificateId: input.id,
        buffer: decoded.buffer,
        fileName: decoded.fileName,
      });
      await db.updateHealthCertificate(ctx.user.id, input.id, stored);
      return {
        ...stored,
        downloadUrl: (await getHealthCertificateDownloadUrl(stored.storageKey))
          .url,
      };
    }),

  setAlertPause: protectedProcedure
    .input(
      z
        .object({
          id: z.number().int().positive(),
          paused: z.boolean(),
          reason: z.string().trim().max(1000).optional(),
        })
        .refine(input => !input.paused || Boolean(input.reason), {
          message: "알림 일시 중지 사유를 입력해 주세요.",
          path: ["reason"],
        })
    )
    .mutation(async ({ ctx, input }) =>
      db.updateHealthCertificate(
        ctx.user.id,
        input.id,
        input.paused
          ? {
              alertStatus: "paused",
              alertPausedAt: kstDateString(),
              alertPauseReason: input.reason ?? null,
            }
          : {
              alertStatus: "active",
              alertPausedAt: null,
              alertPauseReason: null,
            }
      )
    ),

  setEmploymentStatus: protectedProcedure
    .input(
      z
        .object({
          id: z.number().int().positive(),
          inactive: z.boolean(),
          reason: z.string().trim().max(1000).optional(),
        })
        .refine(input => !input.inactive || Boolean(input.reason), {
          message: "재직 제외 사유를 입력해 주세요.",
          path: ["reason"],
        })
    )
    .mutation(async ({ ctx, input }) =>
      db.updateHealthCertificate(
        ctx.user.id,
        input.id,
        input.inactive
          ? {
              employmentStatus: "inactive",
              inactiveAt: kstDateString(),
              inactiveReason: input.reason ?? null,
            }
          : {
              employmentStatus: "active",
              inactiveAt: null,
              inactiveReason: null,
              alertStatus: "active",
              alertPausedAt: null,
              alertPauseReason: null,
            }
      )
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      db.deleteHealthCertificate(ctx.user.id, input.id)
    ),

  sendTestNotification: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getNotificationSettings(ctx.user.id);
    return sendHealthCertificateNotification(settings, {
      force: true,
      isTest: true,
    });
  }),
});
