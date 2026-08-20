import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import * as scheduleCore from "./qualityScheduleCore";
import * as monthlyReport from "./monthlyInspectionReport";
import * as monthlyReportShare from "./monthlyReportShare";
import { buildDailyCron, buildDailyCronAtKst, buildEmergencyAlertMessage, buildQualityAlertMessage, sendQualityNotification, shouldSkipForGlobalAlertPause } from "./qualityNotificationService";

describe("텔레그램 자가품질검사 알림", () => {
  beforeEach(() => {
    vi.spyOn(db, "listTelegramRecipients").mockResolvedValue([] as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("한국 표준시 오전 9시를 UTC 자정 정기 작업으로 변환한다", () => {
    expect(buildDailyCron(9)).toBe("0 0 0 * * *");
    expect(buildDailyCron(0)).toBe("0 0 15 * * *");
  });

  it("여러 한국 표준시 알림 시간을 UTC 6필드 크론으로 변환한다", () => {
    expect(buildDailyCronAtKst("09:00")).toBe("0 0 0 * * *");
    expect(buildDailyCronAtKst("18:30")).toBe("0 30 9 * * *");
    expect(() => buildDailyCronAtKst("25:00")).toThrow();
  });

  it("기간 초과와 검사 임박 품목을 한 메시지로 정리한다", () => {
    const message = buildQualityAlertMessage({
      referenceDate: "2026-08-19",
      overdue: [{ name: "혼합음료", nextDeadline: "2026-06-29", daysRemaining: -51 }],
      urgent: [{ name: "액상차", nextDeadline: "2026-08-25", daysRemaining: 6 }],
    });
    expect(message).toContain("기간 초과 1건");
    expect(message).toContain("검사 임박 1건");
    expect(message).toContain("혼합음료");
    expect(message).toContain("D-6");
  });

  it("담당자 이름을 포함한 맞춤형 알림 메시지를 만든다", () => {
    const message = buildQualityAlertMessage({
      referenceDate: "2026-08-20",
      recipientName: "음료 생산 담당",
      overdue: [],
      urgent: [{ inspectionTypeId: 4, productId: 41, name: "과채주스 > 사과주스", nextDeadline: "2026-08-25", daysRemaining: 5 }],
    });
    expect(message).toContain("담당: 음료 생산 담당");
    expect(message).toContain("사과주스");
  });

  it("제품 알림에는 최신 성적서 링크를 넣고 미보관 제품은 상태를 표시한다", () => {
    const message = buildQualityAlertMessage({
      referenceDate: "2026-08-19",
      overdue: [{ name: "과채주스 > 사과주스", nextDeadline: "2026-07-19", daysRemaining: -31, isProduct: true, certificateFileName: "사과주스.pdf", certificateShareUrl: "https://example.test/certificate" }],
      urgent: [{ name: "과채주스 > 배주스", nextDeadline: "2026-08-25", daysRemaining: 6, isProduct: true }],
    });
    expect(message).toContain("사과주스.pdf");
    expect(message).toContain("https://example.test/certificate");
    expect(message).toContain("성적서: 미보관");
  });

  it("7일 이내 만료 제품은 별도의 긴급 알림 메시지로 만든다", () => {
    const message = buildEmergencyAlertMessage([{ name: "과채주스 > 사과주스", nextDeadline: "2026-08-25", daysRemaining: 5, isProduct: true }], "2026-08-20");
    expect(message).toContain("7일 이내 긴급 알림");
    expect(message).toContain("D-5");
    expect(message).toContain("사과주스");
  });

  it("사전 알림 기준이 7일보다 짧아도 잔여 7일 제품에는 긴급 알림을 보낸다", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 81 } }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(db, "listInspectionTypes").mockResolvedValue([{ id: 4, ownerId: 1, name: "과채주스", intervalMonths: 2, lastManufactureDate: null, testItems: "세균수", isActive: true, productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "active", alertPausedAt: null, alertPauseReason: null }] as never);
    vi.spyOn(db, "listProducts").mockResolvedValue([{ id: 41, ownerId: 1, inspectionTypeId: 4, name: "사과주스 1L", intervalMonths: 1, lastManufactureDate: "2026-07-25", isActive: true, productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "active", alertPausedAt: null, alertPauseReason: null }] as never);
    vi.spyOn(db, "getLatestCertificatesByProduct").mockResolvedValue(new Map());
    vi.spyOn(db, "getNotificationLogByIdempotencyKey").mockResolvedValue(undefined);
    const createLog = vi.spyOn(db, "createNotificationLog").mockResolvedValue(42 as never);
    vi.spyOn(db, "updateNotificationLog").mockResolvedValue(undefined);
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue({} as never);

    await sendQualityNotification({ id: 1, ownerId: 1, telegramChatId: "-100", isAlertPaused: false, warningDays: 3 } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: expect.stringContaining("emergency:1:"), message: expect.stringContaining("7일 이내 긴급 알림") }));
  });

  it("매월 첫 자동 실행은 PDF 보고서 링크를 별도 발송하고 같은 달 재발송을 막는다", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.spyOn(scheduleCore, "kstDateString").mockReturnValue("2026-09-01");
    vi.spyOn(monthlyReport, "ensureMonthlyInspectionReport").mockResolvedValue({ reportMonth: "2026-09" } as never);
    vi.spyOn(monthlyReportShare, "createMonthlyReportShareUrl").mockResolvedValue("https://example.test/report");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 91 } }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(db, "listInspectionTypes").mockResolvedValue([] as never);
    vi.spyOn(db, "listProducts").mockResolvedValue([] as never);
    vi.spyOn(db, "getLatestCertificatesByProduct").mockResolvedValue(new Map());
    vi.spyOn(db, "getNotificationLogByIdempotencyKey").mockResolvedValueOnce(undefined).mockResolvedValueOnce({ status: "sent" } as never);
    const createLog = vi.spyOn(db, "createNotificationLog").mockResolvedValue(31 as never);
    vi.spyOn(db, "updateNotificationLog").mockResolvedValue(undefined);
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue({} as never);
    const settings = { id: 1, ownerId: 1, telegramChatId: "-100", isAlertPaused: false, warningDays: 14 } as never;

    await sendQualityNotification(settings);
    await sendQualityNotification(settings);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "monthly-report:1:default:2026-09", alertLevel: "report" }));
  });

  it("전체 알림 일시 중지 상태에서는 자동 발송을 건너뛰고 시험 발송은 허용한다", () => {
    expect(shouldSkipForGlobalAlertPause(true)).toBe(true);
    expect(shouldSkipForGlobalAlertPause(true, true)).toBe(false);
    expect(shouldSkipForGlobalAlertPause(false)).toBe(false);
  });

  it("전체 알림 중지에서는 일정 조회·발송 로그 생성 없이 자동 발송을 건너뛴다", async () => {
    const updateSettings = vi.spyOn(db, "updateNotificationSettings").mockResolvedValue({} as never);
    const listTypes = vi.spyOn(db, "listInspectionTypes");
    const createLog = vi.spyOn(db, "createNotificationLog");
    const result = await sendQualityNotification({ id: 1, ownerId: 1, telegramChatId: "-100", isAlertPaused: true } as never);

    expect(result).toMatchObject({ sent: false, reason: "alerts-paused" });
    expect(updateSettings).toHaveBeenCalledWith(1, { lastRunAt: expect.any(Date) });
    expect(listTypes).not.toHaveBeenCalled();
    expect(createLog).not.toHaveBeenCalled();
  });

  it("유형별 알림 중지 품목은 일정 조회 후 발송 로그 생성 없이 제외한다", async () => {
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue({} as never);
    vi.spyOn(db, "listInspectionTypes").mockResolvedValue([{
      id: 11, ownerId: 1, name: "과채주스", intervalMonths: 2, lastManufactureDate: "2026-04-01", testItems: "세균수", isActive: true,
      productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "paused", alertPausedAt: "2026-08-19", alertPauseReason: "생산 보류",
    }] as never);
    vi.spyOn(db, "listProducts").mockResolvedValue([] as never);
    vi.spyOn(db, "getLatestCertificatesByProduct").mockResolvedValue(new Map());
    const createLog = vi.spyOn(db, "createNotificationLog");
    const result = await sendQualityNotification({ id: 1, ownerId: 1, telegramChatId: "-100", isAlertPaused: false, warningDays: 14 } as never);

    expect(result).toMatchObject({ sent: false, reason: "no-alerts" });
    expect(createLog).not.toHaveBeenCalled();
  });

  it("제품별 검사 주기 마감 임박 알림은 제품명으로 발송하고 상위 유형 알림과 중복하지 않는다", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(db, "listInspectionTypes").mockResolvedValue([{
      id: 4, ownerId: 1, name: "과채주스", intervalMonths: 2, lastManufactureDate: "2026-04-01", testItems: "세균수", isActive: true,
      productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "active", alertPausedAt: null, alertPauseReason: null,
    }] as never);
    vi.spyOn(db, "listProducts").mockResolvedValue([{
      id: 41, ownerId: 1, inspectionTypeId: 4, name: "사과주스 1L", intervalMonths: 1, lastManufactureDate: "2026-07-25", isActive: true,
      productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "active", alertPausedAt: null, alertPauseReason: null,
    }] as never);
    vi.spyOn(db, "getLatestCertificatesByProduct").mockResolvedValue(new Map());
    vi.spyOn(db, "getNotificationLogByIdempotencyKey").mockResolvedValue(undefined);
    vi.spyOn(db, "createNotificationLog").mockResolvedValue(7 as never);
    vi.spyOn(db, "updateNotificationLog").mockResolvedValue(undefined);
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue({} as never);

    const result = await sendQualityNotification({ id: 1, ownerId: 1, telegramChatId: "-100", isAlertPaused: false, warningDays: 14 } as never);

    expect(result).toMatchObject({ sent: true, urgentCount: 1, overdueCount: 0 });
    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(request.body).toContain("과채주스 > 사과주스 1L");
    expect(request.body).not.toContain("• 과채주스 |");
  });

  it("담당 범위가 일치하는 수신 그룹에만 제품별 맞춤 알림을 발송한다", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.spyOn(scheduleCore, "kstDateString").mockReturnValue("2026-08-20");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 88 } }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(db, "listTelegramRecipients").mockResolvedValue([
      { id: 10, name: "과채주스 담당", telegramChatId: "-101", isActive: true, scopes: [{ scopeType: "inspection_type", scopeId: 4 }] },
      { id: 20, name: "커피 담당", telegramChatId: "-102", isActive: true, scopes: [{ scopeType: "inspection_type", scopeId: 6 }] },
    ] as never);
    vi.spyOn(db, "listInspectionTypes").mockResolvedValue([{ id: 4, ownerId: 1, name: "과채주스", intervalMonths: 2, lastManufactureDate: "2026-04-01", testItems: "세균수", isActive: true, productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "active", alertPausedAt: null, alertPauseReason: null }] as never);
    vi.spyOn(db, "listProducts").mockResolvedValue([{ id: 41, ownerId: 1, inspectionTypeId: 4, name: "사과주스 1L", intervalMonths: 1, lastManufactureDate: "2026-07-25", isActive: true, productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "active", alertPausedAt: null, alertPauseReason: null }] as never);
    vi.spyOn(db, "getLatestCertificatesByProduct").mockResolvedValue(new Map());
    vi.spyOn(db, "getNotificationLogByIdempotencyKey").mockResolvedValue(undefined);
    const createLog = vi.spyOn(db, "createNotificationLog").mockResolvedValue(10 as never);
    vi.spyOn(db, "updateNotificationLog").mockResolvedValue(undefined);
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue({} as never);

    const result = await sendQualityNotification({ id: 1, ownerId: 1, telegramChatId: "-100", isAlertPaused: false, warningDays: 14 } as never);

    expect(result).toMatchObject({ sent: true, recipientCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 10, message: expect.stringContaining("담당: 과채주스 담당") }));
  });
});
