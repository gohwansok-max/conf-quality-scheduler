import { describe, expect, it } from "vitest";
import { buildHealthCertificateAlertMessage, resolveHealthAlertRecipients } from "./healthCertificateNotificationService";

describe("보건증 텔레그램 메시지", () => {
  it("만료 임박 보건증의 담당자·만료일·PDF 링크를 포함한다", () => {
    const message = buildHealthCertificateAlertMessage({ item: { id: 1, employeeName: "홍길동", department: "생산팀", expiresAt: "2026-08-25", daysRemaining: 5, fileName: "홍길동_보건증.pdf", shareUrl: "https://example.test/file" }, referenceDate: "2026-08-20", recipientName: "생산팀 그룹" });
    expect(message).toContain("보건증 만료 임박");
    expect(message).toContain("홍길동 · 생산팀");
    expect(message).toContain("D-5");
    expect(message).toContain("https://example.test/file");
  });

  it("보건증 수신을 선택한 담당자 그룹만 우선 사용하고 없으면 기본 그룹으로 보낸다", () => {
    const recipients = [
      { id: 1, name: "생산팀", telegramChatId: "-1001", isActive: true, receivesHealthAlerts: true },
      { id: 2, name: "품질팀", telegramChatId: "-1002", isActive: true, receivesHealthAlerts: false },
    ];
    expect(resolveHealthAlertRecipients({ telegramChatId: "-999" }, recipients)).toEqual([{ id: 1, name: "생산팀", telegramChatId: "-1001" }]);
    expect(resolveHealthAlertRecipients({ telegramChatId: "-999" }, recipients.map(item => ({ ...item, receivesHealthAlerts: false })))).toEqual([{ id: null, name: "기본 알림 그룹", telegramChatId: "-999" }]);
  });
});
