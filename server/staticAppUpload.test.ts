import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: unknown, options: unknown) => Promise<unknown>;
      getPublicUrl: (path: string) => unknown;
    };
  };
};

function loadStaticApp(storageClient: StorageClient, XMLHttpRequestClass?: unknown) {
  const context: Record<string, any> = {
    URL,
    console: { error() {}, info() {}, log() {}, warn() {} },
    crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    document: { addEventListener() {} },
    setTimeout(callback: () => void) {
      callback();
      return 0;
    },
    window: {
      CONF_RUNTIME_CONFIG: {},
      addEventListener() {},
      location: { hash: "", href: "https://example.test/conf-quality-scheduler/" },
      supabase: { createClient: () => storageClient },
    },
  };
  if (XMLHttpRequestClass) context.XMLHttpRequest = XMLHttpRequestClass;
  vm.runInNewContext(appSource, context, { filename: "app.js" });
  return context;
}

describe("GitHub Pages 파일 업로드", () => {
  it("일시적 네트워크 오류 후 같은 경로로 재시도하고 공개 URL을 반환한다", async () => {
    const paths: string[] = [];
    let attempts = 0;
    const app = loadStaticApp({
      storage: {
        from: (bucket) => {
          expect(bucket).toBe("quality-files");
          return {
            upload: async (path, _file, options) => {
              paths.push(path);
              attempts += 1;
              expect(options).toMatchObject({ cacheControl: "3600", contentType: "application/pdf", upsert: true });
              if (attempts < 3) return { data: null, error: { message: "Failed to fetch" } };
              return { data: { path }, error: null };
            },
            getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
          };
        },
      },
    });

    const result = await app.uploadFileToCloud({ name: "자가품질검사.pdf", size: 245_709, type: "application/pdf" }, "certs");

    expect(attempts).toBe(3);
    expect(new Set(paths).size).toBe(1);
    expect(paths[0]).toMatch(/^certs\/certs_\d+_11111111222243338444555555555555\.pdf$/);
    expect(result).toMatchObject({ name: "자가품질검사.pdf", path: paths[0], url: `https://storage.test/${paths[0]}` });
  });

  it("SDK 전송이 모두 끊기면 Storage 전용 호스트로 보조 업로드한다", async () => {
    class DirectStorageRequest {
      static instances: DirectStorageRequest[] = [];
      headers: Record<string, string> = {};
      method = "";
      url = "";
      status = 0;
      responseText = "";
      timeout = 0;
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;

      constructor() {
        DirectStorageRequest.instances.push(this);
      }

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }

      send() {
        this.status = 200;
        this.responseText = '{"Key":"quality-files/certs/test.pdf"}';
        this.onload?.();
      }
    }

    const app = loadStaticApp({
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: { message: "Failed to fetch" } }),
          getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        }),
      },
    }, DirectStorageRequest);

    const result = await app.uploadFileToCloud({ name: "report.pdf", size: 2000, type: "application/pdf" }, "certs");

    expect(DirectStorageRequest.instances).toHaveLength(1);
    const request = DirectStorageRequest.instances[0]!;
    expect(request).toMatchObject({
      method: "POST",
      url: expect.stringMatching(/^https:\/\/hooaeqywrdihninxnvtb\.storage\.supabase\.co\/storage\/v1\/object\/quality-files\/certs\//),
      timeout: 30000,
    });
    expect(request.headers).toMatchObject({ apikey: expect.any(String), "x-upsert": "true", "Content-Type": "application/pdf" });
    expect(result.url).toMatch(/^https:\/\/storage\.test\/certs\//);
  });

  it("Supabase 오류를 숨기지 않고 파일 정보와 함께 전달한다", async () => {
    const storageError = { message: "new row violates row-level security policy", statusCode: 403 };
    const app = loadStaticApp({
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: storageError }),
          getPublicUrl: () => ({ data: { publicUrl: "" } }),
        }),
      },
    });

    await expect(app.uploadFileToCloud({ name: "report.pdf", size: 1000, type: "application/pdf" }, "certs"))
      .rejects.toMatchObject({ message: storageError.message, statusCode: 403, uploadFileName: "report.pdf", uploadFileSize: 1000 });
    expect(app.getCertificateSaveErrorMessage(storageError)).toContain("등록 권한이 없습니다");
  });

  it("저장소 용량 초과 오류에 선택 파일 크기를 표시한다", () => {
    const app = loadStaticApp({
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: "" } }),
        }),
      },
    });

    expect(app.getCertificateSaveErrorMessage({ message: "Payload too large", statusCode: 413, uploadFileSize: 7_340_032 }))
      .toBe("파일 용량이 클라우드 저장 한도를 초과했습니다 (선택 파일 7.0MB). PDF 용량을 줄인 뒤 다시 첨부하세요.");
  });
});
