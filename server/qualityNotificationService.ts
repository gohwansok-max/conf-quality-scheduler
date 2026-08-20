import type { QualityNotificationSetting } from "../drizzle/schema";
import * as db from "./db";
import { buildInspectionSchedule, buildProductSchedule, formatDeadline, kstDateString } from "./qualityScheduleCore";
import { createCertificateShareUrl } from "./certificateShare";
import { ensureMonthlyInspectionReport } from "./monthlyInspectionReport";
import { createMonthlyReportShareUrl } from "./monthlyReportShare";

type TelegramUpdate = {
  update_id: number;
  message?: { chat?: { id: number; type: string; title?: string } };
  my_chat_member?: { chat?: { id: number; type: string; title?: string } };
};

type TelegramApiResponse<T> = { ok: boolean; result?: T; description?: string };

function telegramToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("텔레그램 봇 토큰이 설정되지 않았습니다.");
  return token;
}

async function telegramRequest<T>(method: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${telegramToken()}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const payload = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) throw new Error(payload.description || "텔레그램 요청에 실패했습니다.");
  return payload.result;
}

export async function findTelegramGroups() {
  const updates = await telegramRequest<TelegramUpdate[]>("getUpdates");
  const groups = new Map<string, { chatId: string; title: string; updateId: number }>();
  for (const update of updates) {
    const chat = update.message?.chat ?? update.my_chat_member?.chat;
    if (chat && (chat.type === "group" || chat.type === "supergroup")) groups.set(String(chat.id), { chatId: String(chat.id), title: chat.title ?? "이름 없는 그룹", updateId: update.update_id });
  }
  return Array.from(groups.values()).sort((a, b) => b.updateId - a.updateId).map(({ chatId, title }) => ({ chatId, title }));
}

export function buildDailyCron(hourKst: number): string {
  const hourUtc = (hourKst - 9 + 24) % 24;
  return `0 0 ${hourUtc} * * *`;
}

export function buildDailyCronAtKst(timeKst: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(timeKst);
  if (!match) throw new Error("알림 시간 형식이 올바르지 않습니다.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("알림 시간 범위가 올바르지 않습니다.");
  return `0 ${minute} ${(hour - 9 + 24) % 24} * * *`;
}

export function shouldSkipForGlobalAlertPause(isAlertPaused: boolean, force = false) {
  return isAlertPaused && !force;
}

type AlertItem = {
  inspectionTypeId: number;
  productId?: number;
  name: string;
  nextDeadline: string;
  daysRemaining: number;
  certificateFileName?: string;
  certificateShareUrl?: string;
  isProduct?: boolean;
};

type AlertRecipient = { id: number | null; name: string; telegramChatId: string; scopes: Array<{ scopeType: "inspection_type" | "product"; scopeId: number }> };

function alertLine(item: AlertItem) {
  const line = `• ${item.name} | ${formatDeadline(item.nextDeadline)} | ${item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)}일 초과` : `D-${item.daysRemaining}`}`;
  if (!item.isProduct) return line;
  if (!item.certificateShareUrl) return `${line}\n  성적서: 미보관`;
  return `${line}\n  최신 성적서: ${item.certificateFileName ?? "다운로드"}\n  ${item.certificateShareUrl}`;
}

export function buildQualityAlertMessage(input: { overdue: AlertItem[]; urgent: AlertItem[]; referenceDate: string; isTest?: boolean; recipientName?: string }) {
  const title = input.isTest ? "[코엔에프 자가품질검사] 시험 알림" : "[코엔에프 자가품질검사] 확인 필요";
  const lines = [title, `기준일: ${input.referenceDate.replaceAll("-", ".")}`];
  if (input.recipientName) lines.push(`담당: ${input.recipientName}`);
  if (input.overdue.length) lines.push("", `🚨 기간 초과 ${input.overdue.length}건`, ...input.overdue.map(alertLine));
  if (input.urgent.length) lines.push("", `⚠️ 검사 임박 ${input.urgent.length}건`, ...input.urgent.map(alertLine));
  if (!input.overdue.length && !input.urgent.length) lines.push("", "현재 담당 범위에 검사 임박 또는 기간 초과 품목이 없습니다.");
  lines.push("", "상세 일정은 자가품질검사 스케줄러에서 확인하세요.");
  return lines.join("\n");
}

export function buildEmergencyAlertMessage(items: AlertItem[], referenceDate: string, recipientName?: string) {
  const lines = ["[코엔에프 자가품질검사] 🚨 7일 이내 긴급 알림", `기준일: ${referenceDate.replaceAll("-", ".")}`];
  if (recipientName) lines.push(`담당: ${recipientName}`);
  lines.push("", `검사 만료 7일 이내 ${items.length}건`, ...items.map(alertLine), "", "즉시 검사 의뢰 가능 여부와 생산 계획을 확인해 주세요.");
  return lines.join("\n");
}

export async function sendTelegramMessage(chatId: string, text: string) {
  return telegramRequest<{ message_id: number }>("sendMessage", { chat_id: chatId, text });
}

function selectRecipientItems(items: AlertItem[], recipient: AlertRecipient) {
  if (recipient.id === null) return items;
  const typeIds = new Set(recipient.scopes.filter(scope => scope.scopeType === "inspection_type").map(scope => scope.scopeId));
  const productIds = new Set(recipient.scopes.filter(scope => scope.scopeType === "product").map(scope => scope.scopeId));
  return items.filter(item => typeIds.has(item.inspectionTypeId) || (item.productId !== undefined && productIds.has(item.productId)));
}

export async function sendQualityNotification(settings: QualityNotificationSetting, options: { force?: boolean; isTest?: boolean; timeSlot?: string } = {}) {
  const configuredRecipients = (await db.listTelegramRecipients(settings.ownerId)).filter(recipient => recipient.isActive);
  const recipients: AlertRecipient[] = configuredRecipients.length
    ? configuredRecipients.map(recipient => ({ id: recipient.id, name: recipient.name, telegramChatId: recipient.telegramChatId, scopes: recipient.scopes }))
    : settings.telegramChatId ? [{ id: null, name: "기본 알림 그룹", telegramChatId: settings.telegramChatId, scopes: [] }] : [];
  if (!recipients.length) throw new Error("텔레그램 알림 그룹 또는 담당자 수신 그룹을 먼저 연결해 주세요.");
  if (shouldSkipForGlobalAlertPause(settings.isAlertPaused, Boolean(options.force))) {
    await db.updateNotificationSettings(settings.ownerId, { lastRunAt: new Date() });
    return { sent: false, reason: "alerts-paused", overdueCount: 0, urgentCount: 0, recipientCount: 0 };
  }

  const referenceDate = kstDateString();
  const inspectionTypes = await db.listInspectionTypes(settings.ownerId);
  const products = await db.listProducts(settings.ownerId);
  const typeById = new Map(inspectionTypes.map(item => [item.id, item]));
  const productManagedTypeIds = new Set(products.filter(product => product.isActive).map(product => product.inspectionTypeId));
  const schedules = inspectionTypes
    .filter(item => item.isActive && item.alertStatus === "active")
    .filter(item => !productManagedTypeIds.has(item.id))
    .map(item => buildInspectionSchedule(item, settings.warningDays, referenceDate));
  const productSchedules = products
    .filter(product => product.isActive)
    .map(product => {
      const parent = typeById.get(product.inspectionTypeId);
      return buildProductSchedule({ ...product, parentTypeName: parent?.name ?? "식품유형 미지정", productionStatus: !parent || !parent.isActive || parent.productionStatus === "stopped" ? "stopped" : product.productionStatus, alertStatus: !parent || parent.alertStatus === "paused" ? "paused" : product.alertStatus }, settings.warningDays, referenceDate);
    });
  const latestCertificateByProduct = await db.getLatestCertificatesByProduct(settings.ownerId);
  const toProductAlertItem = async (item: (typeof productSchedules)[number]): Promise<AlertItem> => {
    const certificate = latestCertificateByProduct.get(item.id);
    return { inspectionTypeId: item.inspectionTypeId, productId: item.id, name: `${item.parentTypeName} > ${item.name}`, nextDeadline: item.nextDeadline!, daysRemaining: item.daysRemaining!, isProduct: true, certificateFileName: certificate?.fileName, certificateShareUrl: certificate ? await createCertificateShareUrl(settings.ownerId, certificate.id) : undefined };
  };
  const typeAlertItems: AlertItem[] = schedules
    .filter(item => (item.status === "overdue" || item.status === "urgent") && item.nextDeadline && item.daysRemaining !== null)
    .map(item => ({ inspectionTypeId: item.id, name: item.name, nextDeadline: item.nextDeadline!, daysRemaining: item.daysRemaining! }));
  const productAlertItems = await Promise.all(productSchedules.filter(item => (item.status === "overdue" || item.status === "urgent") && item.nextDeadline && item.daysRemaining !== null).map(toProductAlertItem));
  const overdue = [...typeAlertItems.filter(item => item.daysRemaining < 0), ...productAlertItems.filter(item => item.daysRemaining < 0)];
  const urgent = [...typeAlertItems.filter(item => item.daysRemaining >= 0), ...productAlertItems.filter(item => item.daysRemaining >= 0)];
  const emergency = await Promise.all(productSchedules.filter(item => Boolean(item.nextDeadline) && item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 7).map(toProductAlertItem));

  const sendAndLog = async (recipient: AlertRecipient, alertLevel: "overdue" | "urgent" | "test" | "report", idempotencyKey: string, message: string) => {
    const existing = await db.getNotificationLogByIdempotencyKey(idempotencyKey);
    if (existing?.status === "sent") return false;
    const logId = await db.createNotificationLog({ settingId: settings.id, recipientId: recipient.id, idempotencyKey, alertDate: referenceDate, alertLevel, status: "pending", message });
    try {
      const result = await sendTelegramMessage(recipient.telegramChatId, message);
      await db.updateNotificationLog(Number(logId), { status: "sent", telegramMessageId: String(result.message_id), sentAt: new Date() });
      return true;
    } catch (error) {
      await db.updateNotificationLog(Number(logId), { status: "failed", errorMessage: String(error) });
      throw error;
    }
  };

  const sentRecipientIds = new Set<string>();
  if (!options.force && !options.isTest && referenceDate.endsWith("-01") && configuredRecipients.length === 0) {
    const report = await ensureMonthlyInspectionReport(settings.ownerId, referenceDate.slice(0, 7));
    const reportMessage = `[코엔에프 자가품질검사] 월간 검사 현황 PDF\n대상 월: ${referenceDate.slice(0, 7)}\n${await createMonthlyReportShareUrl(settings.ownerId, report.reportMonth)}`;
    const defaultRecipient = recipients[0];
    if (await sendAndLog(defaultRecipient, "report", `monthly-report:${settings.id}:default:${referenceDate.slice(0, 7)}`, reportMessage)) sentRecipientIds.add("default");
  }

  if (!options.force && !options.isTest && emergency.length) {
    for (const recipient of recipients) {
      const scopedEmergency = selectRecipientItems(emergency, recipient);
      if (!scopedEmergency.length) continue;
      if (await sendAndLog(recipient, "urgent", `emergency:${settings.id}:${recipient.id ?? "default"}:${referenceDate}`, buildEmergencyAlertMessage(scopedEmergency, referenceDate, recipient.id === null ? undefined : recipient.name))) sentRecipientIds.add(String(recipient.id ?? "default"));
    }
  }

  if (!options.force && overdue.length === 0 && urgent.length === 0) {
    await db.updateNotificationSettings(settings.ownerId, { lastRunAt: new Date() });
    return { sent: false, reason: "no-alerts", overdueCount: 0, urgentCount: 0, recipientCount: 0 };
  }

  for (const recipient of recipients) {
    const recipientOverdue = selectRecipientItems(overdue, recipient);
    const recipientUrgent = selectRecipientItems(urgent, recipient);
    if (!options.force && !recipientOverdue.length && !recipientUrgent.length) continue;
    const alertLevel = options.isTest ? "test" : recipientOverdue.length ? "overdue" : "urgent";
    const idempotencyKey = options.force ? `manual:${settings.id}:${recipient.id ?? "default"}:${Date.now()}` : `daily:${settings.id}:${recipient.id ?? "default"}:${referenceDate}:${options.timeSlot ?? "default"}`;
    const message = buildQualityAlertMessage({ overdue: recipientOverdue, urgent: recipientUrgent, referenceDate, isTest: options.isTest, recipientName: recipient.id === null ? undefined : recipient.name });
    if (await sendAndLog(recipient, alertLevel, idempotencyKey, message)) sentRecipientIds.add(String(recipient.id ?? "default"));
  }
  await db.updateNotificationSettings(settings.ownerId, { lastRunAt: new Date() });
  return { sent: sentRecipientIds.size > 0, overdueCount: overdue.length, urgentCount: urgent.length, emergencyCount: emergency.length, recipientCount: sentRecipientIds.size };
}
