// Client-side docs search. The index is derived from the docs content data;
// matching is plain substring scoring — titles beat headings beat body text.

import type { Block, DocTopic } from "./content.ts";

export interface SearchEntry {
  readonly topicId: string;
  readonly topicTitle: string;
  /** Anchor to navigate to (topic id or heading id). */
  readonly anchor: string;
  /** What the user sees in the result row. */
  readonly title: string;
  /** Lowercased haystack for body matching. */
  readonly body: string;
  readonly weight: "topic" | "heading";
}

export interface SearchResult {
  readonly entry: SearchEntry;
  readonly score: number;
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "ul":
    case "ol":
      return block.items.join(" ");
    case "code":
      return block.code;
    case "table":
      return block.rows.map((row) => row.join(" ")).join(" ");
    case "h2":
    case "h3":
      return "";
  }
}

/** Strip the inline `code`/[link](url) markers used by docs text. */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "");
}

export function buildSearchIndex(topics: readonly DocTopic[]): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const topic of topics) {
    let current: SearchEntry = {
      topicId: topic.id,
      topicTitle: topic.title,
      anchor: topic.id,
      title: topic.title,
      body: plainText(topic.lede).toLowerCase(),
      weight: "topic",
    };
    const bodies: string[] = [current.body];
    const flush = () => {
      entries.push({ ...current, body: bodies.join(" ") });
      bodies.length = 0;
    };
    for (const block of topic.blocks) {
      if (block.kind === "h2" || block.kind === "h3") {
        flush();
        current = {
          topicId: topic.id,
          topicTitle: topic.title,
          anchor: block.id,
          title: plainText(block.text),
          body: "",
          weight: "heading",
        };
      } else {
        bodies.push(plainText(blockText(block)).toLowerCase());
      }
    }
    flush();
  }
  return entries;
}

/**
 * Rank entries against a query. Word-wise AND across title+body; title hits
 * outrank body hits, topic entries outrank heading entries on ties.
 */
export function search(
  index: readonly SearchEntry[],
  query: string,
  limit = 8,
): SearchResult[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const results: SearchResult[] = [];
  for (const entry of index) {
    const title = entry.title.toLowerCase();
    let score = 0;
    let matched = true;
    for (const word of words) {
      if (title.includes(word)) {
        score += title.startsWith(word) ? 5 : 3;
      } else if (entry.body.includes(word)) {
        score += 1;
      } else {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (entry.weight === "topic") score += 0.5;
    results.push({ entry, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
