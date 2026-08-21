import { describe, expect, it, vi, afterEach } from "vitest";
import { createCertificateShareUrl } from "./certificateShare";

describe("성적서 텔레그램 공유 링크", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("성적서 ID와 소유자 ID를 포함한 7일 한정 공유 링크를 만든다", async () => {
    vi.stubEnv("JWT_SECRET", "test-share-secret-for-certificate-links");
    const url = await createCertificateShareUrl(11, 42);
    expect(url).toContain("/api/quality-certificates/share/42?token=");
    expect(url).toContain("confsched-igvqjfhh.manus.space");
  });
});
