// Tiny inline renderer for docs/landing text: `code`, **strong**, and
// [label](url). No markdown dependency; only these three forms exist in
// site content.

import type { ReactNode } from "react";

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index;
    if (index > last) nodes.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const url = token.slice(split + 2, -1);
      const external = url.startsWith("http");
      nodes.push(
        <a key={key++} href={url} {...(external ? { rel: "noopener" } : {})}>
          {label}
        </a>,
      );
    }
    last = index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
