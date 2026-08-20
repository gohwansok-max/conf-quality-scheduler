import type { QualityNotificationSetting } from "../drizzle/schema";
import * as db from "./db";
import { buildHealthCertificateSchedule } from "./healthCertificateCore";
import { createHealthCertificateShareUrl } from "./healthCertificateShare";
import { kstDateString } from "./qualityScheduleCore";
import { sendTelegramMessage } from "./qualityNotificationService";

type HealthAlertItem = {
  id: number;
  employeeName: string;
  department: string | null;
  expiresAt: string;
  daysRemaining: number;
  fileName: string | null;
  shareUrl?: string;
};

export type HealthAlertRecipient = { id: number | null; name: string; telegramChatId: string };

export function resolveHealthAlertRecipients(settings: Pick<QualityNotificationSetting, "telegramChatId">, configured: Array<{ id: number; name: string; telegramChatId: string; isActive: boolean; receivesHealthAlerts: boolean }>): HealthAlertRecipient[] {
  const healthRecipients = configured.filter(recipient => recipient.isActive && recipient.receivesHealthAlerts);
  if (healthRecipients.length) return healthRecipients.map(item => ({ id: item.id, name: item.name, telegramChatId: item.telegramChatId }));
  return settings.telegramChatId ? [{ id: null, name: "기본 알림 그룹", telegramChatId: settings.telegramChatId }] : [];
}

function line(item: HealthAlertItem) {
  const deadline = item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)}일 초과` : `D-${item.daysRemaining}`;
  const person = item.department ? `${item.employeeName} · ${item.department}` : item.employeeName;
  return [`• ${person} | 만료 ${item.expiresAt.replaceAll("-", ".")} | ${deadline}`, item.shareUrl ? `  PDF: ${item.fileName ?? "보건증"}\n  ${item.shareUrl}` : "  PDF: 미보관"].join("\n");
}

export function buildHealthCertificateAlertMessage(input: { item: HealthAlertItem; referenceDate: string; isTest?: boolean; recipientName?: string }) {
  const overdue = input.item.daysRemaining < 0;
  const title = input.isTest ? "[코엔에프 보건증 관리] 시험 알림" : overdue ? "[코엔에프 보건증 관리] 🚨 보건증 기간 초과" : "[코엔에프 보건증 관리] ⚠️ 보건증 만료 임박";
  const lines = [title, `기준일: ${input.referenceDate.replaceAll("-", ".")}`];
  if (input.recipientName) lines.push(`수신 그룹: ${input.recipientName}`);
  lines.push("", line(input.item), "", overdue ? "갱신 전까지 해당 담당자의 업무 배치 가능 여부를 확인해 주세요." : "만료 전에 보건증 갱신 일정을 확인해 주세요.");
  return lines.join("\n");
}

export async function sendHealthCertificateNotification(settings: QualityNotificationSetting, options: { force?: boolean; isTest?: boolean } = {}) {
  const referenceDate = kstDateString();
  const certificates = await db.listHealthCertificates(settings.ownerId);
  const scheduled = certificates
    .map(item => buildHealthCertificateSchedule(item, referenceDate))
    .filter(item => item.employmentStatus === "active" && item.alertStatus === "active")
    .filter(item => options.force || item.status === "overdue" || item.status === "urgent");
  const items = await Promise.all(scheduled.map(async item => ({
    id: item.id,
    employeeName: item.employeeName,
    department: item.department,
    expiresAt: item.expiresAt,
    daysRemaining: item.daysRemaining,
    fileName: item.fileName ?? null,
    shareUrl: item.storageKey ? await createHealthCertificateShareUrl(settings.ownerId, item.id) : undefined,
  })));
  if (!items.length) return { sent: false, count: 0, recipientCount: 0, reason: "no-health-alerts" as const };

  const recipients = resolveHealthAlertRecipients(settings, await db.listTelegramRecipients(settings.ownerId));
  if (!recipients.length) throw new Error("보건증 알림을 받을 텔레그램 그룹을 먼저 연결해 주세요.");

  let sent = 0;
  const sentRecipients = new Set<string>();
  for (const recipient of recipients) {
    for (const item of items) {
      const key = options.force
        ? `health-manual:${item.id}:${recipient.id ?? "default"}:${Date.now()}`
        : `health-daily:${item.id}:${recipient.id ?? "default"}:${referenceDate}`;
      const existing = await db.getHealthCertificateNotificationLog(key);
      if (existing?.status === "sent") continue;
      const level = options.isTest ? "test" : item.daysRemaining < 0 ? "overdue" : "urgent";
      const message = buildHealthCertificateAlertMessage({ item, referenceDate, isTest: options.isTest, recipientName: recipient.id === null ? undefined : recipient.name });
      const logId = await db.createHealthCertificateNotificationLog({ ownerId: settings.ownerId, healthCertificateId: item.id, recipientId: recipient.id, idempotencyKey: key, alertDate: referenceDate, alertLevel: level, status: "pending", message });
      try {
        const result = await sendTelegramMessage(recipient.telegramChatId, message);
        await db.updateHealthCertificateNotificationLog(logId, { status: "sent", telegramMessageId: String(result.message_id), sentAt: new Date() });
        sent += 1;
        sentRecipients.add(String(recipient.id ?? "default"));
      } catch (error) {
        await db.updateHealthCertificateNotificationLog(logId, { status: "failed", errorMessage: String(error) });
        throw error;
      }
    }
  }
  return { sent: sent > 0, count: items.length, messageCount: sent, recipientCount: sentRecipients.size };
}
