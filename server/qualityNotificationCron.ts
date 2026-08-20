import type { Request, Response } from "express";
import * as db from "./db";
import { sendHealthCertificateNotification } from "./healthCertificateNotificationService";
import { sendQualityNotification } from "./qualityNotificationService";
import { sdk } from "./_core/sdk";

export async function runQualityNotificationCron(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });

    const timeSlot = await db.getNotificationTimeSlotByTaskUid(user.taskUid);
    const settings = timeSlot ? await db.getNotificationSettings(timeSlot.ownerId) : await db.getSettingsByCronTaskUid(user.taskUid);
    if (!settings || !settings.isScheduleEnabled) return res.json({ ok: true, skipped: "orphan-or-disabled" });
    if (timeSlot && !timeSlot.isActive) return res.json({ ok: true, skipped: "time-slot-disabled" });
    if (settings.isAlertPaused) return res.json({ ok: true, skipped: "alerts-paused" });

    const [qualityResult, healthResult] = await Promise.all([
      sendQualityNotification(settings, { timeSlot: timeSlot?.timeKst }),
      sendHealthCertificateNotification(settings),
    ]);
    return res.json({ ok: true, result: { quality: qualityResult, health: healthResult } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Quality notification cron]", error);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
  }
}
