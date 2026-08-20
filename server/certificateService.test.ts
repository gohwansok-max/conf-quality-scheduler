import { describe, expect, it } from "vitest";
import { buildAsciiStorageFilename, decodeCertificateUpload } from "./certificateService";

describe("검사성적서 파일 검증", () => {
  it("허용된 PDF 파일을 버퍼와 한글 표시 파일명으로 변환한다", () => {
    const result = decodeCertificateUpload(Buffer.from("quality-certificate").toString("base64"), "성적서 1호.pdf", "application/pdf");
    expect(result.fileName).toBe("성적서 1호.pdf");
    expect(result.buffer.toString()).toBe("quality-certificate");
  });

  it("저장소 경로용 파일명은 한글 원본과 관계없이 ASCII로 생성한다", () => {
    const storageName = buildAsciiStorageFilename("자가품질검사서_과채주스.pdf");
    expect(storageName).toMatch(/^certificate_[a-f0-9]{32}\.pdf$/);
    expect(/[^\x00-\x7F]/.test(storageName)).toBe(false);
  });

  it("허용되지 않은 파일 형식을 차단한다", () => {
    expect(() => decodeCertificateUpload("c2NyaXB0", "malware.exe", "application/x-msdownload")).toThrow("PDF, Excel, JPG, PNG");
  });
});
