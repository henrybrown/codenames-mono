import { describe, it, expect, afterEach, vi } from "vitest";
import { createHttpClient, HttpError } from "@backend/shared/http";

const fakeLogger = {
  for: () => fakeLogger,
  withMeta: () => fakeLogger,
  toConsole: () => fakeLogger,
  create: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
} as any;

describe("HttpClient", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  describe("postJson", () => {
    it("sends POST with JSON body and merged headers", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      globalThis.fetch = fetchMock;

      const client = createHttpClient(fakeLogger);
      await client.postJson<{ ok: boolean }>(
        "https://example.test/api",
        { hello: "world" },
        { headers: { "x-test": "yes" }, source: "TestProvider" },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe("https://example.test/api");
      expect(calledInit.method).toBe("POST");
      expect(calledInit.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-test": "yes",
      });
      expect(calledInit.body).toBe(JSON.stringify({ hello: "world" }));
    });

    it("returns parsed JSON on success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: 42 }), { status: 200 }),
      );

      const client = createHttpClient(fakeLogger);
      const result = await client.postJson<{ value: number }>("https://x.test", {});
      expect(result).toEqual({ value: 42 });
    });

    it("throws HttpError with status and body on non-2xx", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("upstream is sad", { status: 503, statusText: "Service Unavailable" }),
      );

      const client = createHttpClient(fakeLogger);
      await expect(
        client.postJson("https://x.test/foo", {}, { source: "Upstream" }),
      ).rejects.toMatchObject({
        name: "HttpError",
        status: 503,
        source: "Upstream",
        responseBody: "upstream is sad",
        url: "https://x.test/foo",
      });
    });

    it("wraps transport errors as HttpError with status 0", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("network down"));
      const client = createHttpClient(fakeLogger);
      const promise = client.postJson("https://x.test", {}, { source: "Upstream" });
      await expect(promise).rejects.toBeInstanceOf(HttpError);
      await expect(promise).rejects.toMatchObject({ status: 0, source: "Upstream" });
    });
  });

  describe("getJson", () => {
    it("sends GET and returns parsed JSON", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
      );
      globalThis.fetch = fetchMock;

      const client = createHttpClient(fakeLogger);
      const result = await client.getJson<{ ok: number }>("https://x.test/health");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].method).toBe("GET");
      expect(result).toEqual({ ok: 1 });
    });
  });
});
