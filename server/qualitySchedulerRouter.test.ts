import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import * as heartbeat from "./_core/heartbeat";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "quality-owner",
      email: "quality@example.com",
      name: "품질관리자",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("qualityScheduler 제품별 알림·생산 상태", () => {
  afterEach(() => vi.restoreAllMocks());

  it("제품 알림을 일시 중지·재개한다", async () => {
    const updateProduct = vi.spyOn(db, "updateProduct").mockResolvedValue({ id: 21 } as never);
    const caller = appRouter.createCaller(createContext());

    await caller.qualityScheduler.setProductAlertPause({ productId: 21, paused: true, reason: "시즌 생산 대기" });
    await caller.qualityScheduler.setProductAlertPause({ productId: 21, paused: false });

    expect(updateProduct).toHaveBeenNthCalledWith(1, 1, 21, expect.objectContaining({ alertStatus: "paused", alertPauseReason: "시즌 생산 대기" }));
    expect(updateProduct).toHaveBeenNthCalledWith(2, 1, 21, { alertStatus: "active", alertPausedAt: null, alertPauseReason: null });
  });

  it("제품 생산을 중단·재개하며 재개 시 제품 알림도 함께 복원한다", async () => {
    const updateProduct = vi.spyOn(db, "updateProduct").mockResolvedValue({ id: 21 } as never);
    const caller = appRouter.createCaller(createContext());

    await caller.qualityScheduler.setProductProduction({ productId: 21, stopped: true, reason: "단종" });
    await caller.qualityScheduler.setProductProduction({ productId: 21, stopped: false });

    expect(updateProduct).toHaveBeenNthCalledWith(1, 1, 21, expect.objectContaining({ productionStatus: "stopped", productionStopReason: "단종" }));
    expect(updateProduct).toHaveBeenNthCalledWith(2, 1, 21, expect.objectContaining({ productionStatus: "active", alertStatus: "active", alertPausedAt: null }));
  });

  it("자동 알림이 꺼진 상태에서는 시간대만 저장하고 Heartbeat 작업을 만들지 않는다", async () => {
    const settings = { id: 4, ownerId: 1, telegramChatId: "-100", warningDays: 14, alertHourKst: 9, scheduleCronTaskUid: null, isScheduleEnabled: false, isAlertPaused: false };
    vi.spyOn(db, "getNotificationSettings").mockResolvedValue(settings as never);
    vi.spyOn(db, "listNotificationTimeSlots").mockResolvedValue([] as never);
    const createSlot = vi.spyOn(db, "createNotificationTimeSlot").mockResolvedValue(9 as never);
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue(settings as never);
    const createHeartbeat = vi.spyOn(heartbeat, "createHeartbeatJob");
    const caller = appRouter.createCaller(createContext());

    await caller.qualityScheduler.setAutomationSchedule({ enabled: false, times: ["09:00", "14:30"] });

    expect(createHeartbeat).not.toHaveBeenCalled();
    expect(createSlot).toHaveBeenCalledWith(1, { timeKst: "09:00", isActive: false });
    expect(createSlot).toHaveBeenCalledWith(1, { timeKst: "14:30", isActive: false });
  });

  it("자동 알림을 시작하면 중복 시간대는 제거하고 필요한 Heartbeat 작업만 만든다", async () => {
    const settings = { id: 4, ownerId: 1, telegramChatId: "-100", warningDays: 14, alertHourKst: 9, scheduleCronTaskUid: null, isScheduleEnabled: false, isAlertPaused: false };
    vi.spyOn(db, "getNotificationSettings").mockResolvedValue(settings as never);
    vi.spyOn(db, "listNotificationTimeSlots")
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 11, ownerId: 1, timeKst: "09:00", scheduleCronTaskUid: "task-09", isActive: true }] as never);
    const createSlot = vi.spyOn(db, "createNotificationTimeSlot").mockResolvedValue(11 as never);
    const createHeartbeat = vi.spyOn(heartbeat, "createHeartbeatJob").mockResolvedValue({ taskUid: "task-09" } as never);
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue({ ...settings, scheduleCronTaskUid: "task-09", isScheduleEnabled: true } as never);
    const caller = appRouter.createCaller(createContext());

    await caller.qualityScheduler.setAutomationSchedule({ enabled: true, times: ["09:00", "09:00"] });

    expect(createHeartbeat).toHaveBeenCalledTimes(1);
    expect(createSlot).toHaveBeenCalledWith(1, expect.objectContaining({ timeKst: "09:00", scheduleCronTaskUid: "task-09", isActive: true }));
  });

  it("제거한 시간대의 Heartbeat 작업과 슬롯을 함께 삭제한다", async () => {
    const settings = { id: 4, ownerId: 1, telegramChatId: "-100", warningDays: 14, alertHourKst: 9, scheduleCronTaskUid: "task-09", isScheduleEnabled: true, isAlertPaused: false };
    const keptSlot = { id: 11, ownerId: 1, timeKst: "09:00", scheduleCronTaskUid: "task-09", isActive: true };
    const removedSlot = { id: 12, ownerId: 1, timeKst: "14:30", scheduleCronTaskUid: "task-1430", isActive: true };
    vi.spyOn(db, "getNotificationSettings").mockResolvedValue(settings as never);
    vi.spyOn(db, "listNotificationTimeSlots")
      .mockResolvedValueOnce([keptSlot, removedSlot] as never)
      .mockResolvedValueOnce([keptSlot] as never)
      .mockResolvedValueOnce([keptSlot] as never);
    const deleteSlot = vi.spyOn(db, "deleteNotificationTimeSlot").mockResolvedValue(undefined as never);
    const deleteHeartbeat = vi.spyOn(heartbeat, "deleteHeartbeatJob").mockResolvedValue(undefined as never);
    vi.spyOn(heartbeat, "updateHeartbeatJob").mockResolvedValue(undefined as never);
    vi.spyOn(db, "updateNotificationTimeSlot").mockResolvedValue(undefined as never);
    vi.spyOn(db, "updateNotificationSettings").mockResolvedValue(settings as never);
    const caller = appRouter.createCaller(createContext());

    await caller.qualityScheduler.setAutomationSchedule({ enabled: true, times: ["09:00"] });

    expect(deleteHeartbeat).toHaveBeenCalledWith("task-1430", "");
    expect(deleteSlot).toHaveBeenCalledWith(1, 12);
  });

  it("실제 생산 제품의 제조일을 순차 기록으로 저장한다", async () => {
    const recordDates = vi.spyOn(db, "recordProductManufactureDates").mockResolvedValue([] as never);
    const caller = appRouter.createCaller(createContext());

    await caller.qualityScheduler.recordManufactureDates({ entries: [{ productId: 21, manufactureDate: "2026-08-20", memo: "8월 정기 생산" }, { productId: 22, manufactureDate: "2026-08-21" }] });

    expect(recordDates).toHaveBeenCalledWith(1, [{ productId: 21, manufactureDate: "2026-08-20", memo: "8월 정기 생산" }, { productId: 22, manufactureDate: "2026-08-21" }]);
  });

  it("표준 성적서 발급번호 규칙을 저장하고 다음 번호를 조회한다", async () => {
    const saveRule = vi.spyOn(db, "updateCertificateNumberRule").mockResolvedValue({ prefix: "KOENF-QC", sequenceDigits: 4 } as never);
    const suggest = vi.spyOn(db, "suggestCertificateNumber").mockResolvedValue({ number: "KOENF-QC-2026-0001" } as never);
    const caller = appRouter.createCaller(createContext());

    await caller.qualityScheduler.updateCertificateNumberRule({ prefix: "KOENF-QC", sequenceDigits: 4 });
    const result = await caller.qualityScheduler.suggestCertificateNumber({ inspectionDate: "2026-08-20" });

    expect(saveRule).toHaveBeenCalledWith(1, { prefix: "KOENF-QC", sequenceDigits: 4 });
    expect(suggest).toHaveBeenCalledWith(1, "2026-08-20");
    expect(result.number).toBe("KOENF-QC-2026-0001");
  });

  it("담당자별 수신 그룹과 식품유형·제품 범위를 저장한다", async () => {
    const createRecipient = vi.spyOn(db, "createTelegramRecipient").mockResolvedValue(51 as never);
    const caller = appRouter.createCaller(createContext());

    const result = await caller.qualityScheduler.createTelegramRecipient({ name: "음료 생산 담당", telegramChatId: "-100123", scopes: [{ scopeType: "inspection_type", scopeId: 4 }, { scopeType: "product", scopeId: 21 }] });

    expect(createRecipient).toHaveBeenCalledWith(1, expect.objectContaining({ name: "음료 생산 담당", telegramChatId: "-100123", scopes: [{ scopeType: "inspection_type", scopeId: 4 }, { scopeType: "product", scopeId: 21 }] }));
    expect(result).toEqual({ id: 51 });
  });
});
