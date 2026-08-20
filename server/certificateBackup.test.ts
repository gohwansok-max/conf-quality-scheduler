import { describe, expect, it } from "vitest";
import { buildBackupEntryName, createZipArchive } from "./certificateBackup";

describe("성적서 ZIP 백업 파일명", () => {
  it("한글 원본 파일명은 유지하고 성적서 ID를 붙여 중복을 피한다", () => {
    const entry = buildBackupEntryName({ id: 28, inspectionDate: "2026-08-19", fileName: "자가품질검사서_과채주스.pdf" } as never);
    expect(entry).toBe("2026-08-19_28_자가품질검사서_과채주스.pdf");
  });

  it("경로 구분 문자는 ZIP 내부 경로로 해석되지 않게 바꾼다", () => {
    const entry = buildBackupEntryName({ id: 29, inspectionDate: null, fileName: "../검사서.pdf" } as never);
    expect(entry).toBe("검사일미입력_29_.._검사서.pdf");
  });

  it("ZIP 압축 모듈을 서버 런타임에서 생성할 수 있다", () => {
    const archive = createZipArchive();
    expect(typeof archive.append).toBe("function");
    expect(typeof archive.finalize).toBe("function");
    archive.abort();
  });
});
