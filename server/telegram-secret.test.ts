import { describe, expect, it } from "vitest";

describe("텔레그램 봇 인증", () => {
  it("설정된 봇 토큰의 존재와 형식을 검증한다", () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    expect(token, "TELEGRAM_BOT_TOKEN이 설정되어야 합니다.").toBeTruthy();
    expect(token).toMatch(/^\d{6,}:[A-Za-z0-9_-]{20,}$/);
  });
});
