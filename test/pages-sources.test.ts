import { describe, expect, it } from "vitest";
import { pagesSources } from "../src/pages-sources";

describe("Pages sources allowlist", () => {
  it("uses the six owned deployments by default", () => {
    const sources = pagesSources({} as never);
    expect(sources.map(source => source.url)).toEqual(Array.from({ length: 6 }, (_, index) => `https://p${index + 1}.pages.dev/`));
  });

  it("rejects incomplete or external source configuration", () => {
    const sources = pagesSources({ PAGES_SOURCES_JSON: JSON.stringify([{ id: "p1", url: "https://example.com/", enabled: true }]) } as never);
    expect(sources).toHaveLength(6);
    expect(sources[0]?.url).toBe("https://p1.pages.dev/");
  });
});
