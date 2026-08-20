import { describe, expect, it } from "vitest";
import { decodeHealthCertificatePdf } from "./healthCertificateService";

describe("보건증 PDF 업로드 검증", () => {
  it("PDF 헤더가 있는 파일만 허용한다", () => {
    const base64 = Buffer.from("%PDF-1.4\n검증").toString("base64");
    expect(decodeHealthCertificatePdf(base64, "보건증.pdf", "application/pdf").fileName).toBe("보건증.pdf");
    expect(() => decodeHealthCertificatePdf(base64, "보건증.png", "image/png")).toThrow("PDF 파일만");
  });
});
