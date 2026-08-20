import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardLoadError } from "./Home";

describe("DashboardLoadError", () => {
  it("조회 실패 안내와 재시도 제어를 표시한다", () => {
    const markup = renderToStaticMarkup(<DashboardLoadError message="일시적 오류" onRetry={() => undefined} />);

    expect(markup).toContain("일정 정보를 불러오지 못했습니다.");
    expect(markup).toContain("일시적 오류");
    expect(markup).toContain("다시 시도");
  });
});
