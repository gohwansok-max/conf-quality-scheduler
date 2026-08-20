import { describe, expect, it } from "vitest";
import { buildManufactureHistoryWorkbook } from "./manufactureHistoryExport";

describe("제조일 변경 이력 Excel 내보내기", () => {
  it("한글 요약과 변경 전후 제조일을 포함한 워크북을 만든다", () => {
    const workbook = buildManufactureHistoryWorkbook([{
      inspectionTypeName: "과·채주스",
      productName: "Cca주스",
      manufactureDate: "2026-08-20",
      previousManufactureDate: "2026-05-08",
      memo: "8월 정기 생산분",
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
    }]);

    const summary = workbook.getWorksheet("요약");
    const detail = workbook.getWorksheet("변경 이력");
    expect(summary?.getCell("B2").value).toBe("코엔에프 제품 제조일 변경 이력");
    expect(summary?.getCell("C5").value).toBe(1);
    expect(detail?.getCell("B5").value).toBe("식품 유형");
    expect(detail?.getCell("C6").value).toBe("Cca주스");
    expect(detail?.getCell("D6").value).toBe("2026-08-20");
    expect(detail?.getCell("E6").value).toBe("2026-05-08");
    expect(detail?.getCell("F6").value).toBe("8월 정기 생산분");
  });
});
