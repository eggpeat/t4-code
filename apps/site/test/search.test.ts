// Docs search behavior: index derivation, AND matching, and ranking.
import { describe, expect, it } from "vite-plus/test";
import { DOC_TOPICS } from "../src/docs/content.ts";
import { buildSearchIndex, plainText, search } from "../src/docs/search.ts";

const INDEX = buildSearchIndex(DOC_TOPICS);

describe("plainText", () => {
  it("strips inline code, bold, and link markers", () => {
    expect(plainText("run `omp` on **Linux**, see [docs](https://x.test)")).toBe(
      "run omp on Linux, see docs",
    );
  });
});

describe("search index", () => {
  it("has one topic entry per topic plus its headings", () => {
    const topicEntries = INDEX.filter((e) => e.weight === "topic");
    expect(topicEntries.map((e) => e.topicId)).toEqual(DOC_TOPICS.map((t) => t.id));
  });

  it("anchors every entry to a real topic or heading id", () => {
    const known = new Set<string>();
    for (const topic of DOC_TOPICS) {
      known.add(topic.id);
      for (const block of topic.blocks) {
        if (block.kind === "h2" || block.kind === "h3") known.add(block.id);
      }
    }
    for (const entry of INDEX) {
      expect(known.has(entry.anchor)).toBe(true);
    }
  });
});

describe("search", () => {
  it("returns nothing for an empty or whitespace query", () => {
    expect(search(INDEX, "")).toEqual([]);
    expect(search(INDEX, "   ")).toEqual([]);
  });

  it("finds topics by title", () => {
    const results = search(INDEX, "troubleshooting");
    expect(results[0]?.entry.topicId).toBe("troubleshooting");
  });

  it("ranks title matches above body matches", () => {
    const results = search(INDEX, "install");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entry.title.toLowerCase()).toContain("install");
  });

  it("finds body-only terms like the pairing scheme", () => {
    const results = search(INDEX, "t4-code://pair");
    expect(results.some((r) => r.entry.topicId === "remote-pairing")).toBe(true);
  });

  it("requires every query word to match (AND)", () => {
    const results = search(INDEX, "install zzzznotaword");
    expect(results).toEqual([]);
  });

  it("caps results at the limit", () => {
    expect(search(INDEX, "the", 3).length).toBeLessThanOrEqual(3);
  });
});
