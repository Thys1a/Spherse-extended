import { parseFrontmatter } from "./frontmatter";

const TASK_LINE_RE = /^(\s*(?:>\s*)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
const FENCE_RE = /^\s*(```|~~~)/;

export function toggleTaskAt(
  body: string,
  taskIndex: number,
  checked: boolean,
): { nextBody: string; changed: boolean } {
  let seen = -1;
  let inFence = false;
  const lines = body.split("\n");
  const next = lines.map((line) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    const match = line.match(TASK_LINE_RE);
    if (!match) return line;
    seen += 1;
    if (seen !== taskIndex) return line;
    return `${match[1]}[${checked ? "x" : " "}]${line.slice(match[0].length)}`;
  });
  if (seen < taskIndex) return { nextBody: body, changed: false };
  return { nextBody: next.join("\n"), changed: true };
}

export function toggleTaskInContent(
  content: string,
  taskIndex: number,
  checked: boolean,
): { nextContent: string; changed: boolean } {
  const { body } = parseFrontmatter(content);
  const { nextBody, changed } = toggleTaskAt(body, taskIndex, checked);
  if (!changed) return { nextContent: content, changed: false };
  return { nextContent: content.slice(0, content.length - body.length) + nextBody, changed: true };
}
