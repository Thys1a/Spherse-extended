import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createFileTreeProject, launchFileTreeApp } from "./helpers/file-tree";

import { closeApp } from "./helpers/electron";

test.setTimeout(60_000);

function treeFile(page: import("@playwright/test").Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator("aside").locator("button").filter({ hasText: new RegExp(`^${escaped}$`) });
}

async function editorState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const textarea = document.querySelector("[data-content-browser] textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) return null;
    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
      scrollHeight: textarea.scrollHeight,
      clientHeight: textarea.clientHeight,
      value: textarea.value,
    };
  });
}

test("edit-mode find jumps move selection and scroll within bounds", async () => {
  const project = await createFileTreeProject();
  const lines: string[] = [];
  for (let i = 1; i <= 120; i += 1) {
    if (i === 10) lines.push("TARGET one here");
    else if (i === 60) lines.push(`L${"o".repeat(300)} TARGET two here`);
    else if (i === 110) lines.push("TARGET three here");
    else lines.push(`Line ${i} lorem ipsum dolor sit amet.`);
  }
  const body = `${lines.join("\n")}\n`;
  await writeFile(path.join(project.root, "long.md"), body);
  const first = body.indexOf("TARGET");
  const second = body.indexOf("TARGET", first + 1);
  const third = body.indexOf("TARGET", second + 1);
  const expected = [
    { start: first, end: first + 6 },
    { start: second, end: second + 6 },
    { start: third, end: third + 6 },
  ];
  const { app, page } = await launchFileTreeApp(project);

  try {
    await treeFile(page, "long.md").click();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await expect(page.locator("[data-content-browser] textarea")).toBeVisible();
    await page.getByRole("button", { name: "查找", exact: true }).click();
    const query = page.locator("[data-content-edit-findbar] input[placeholder='查找']");
    await query.fill("TARGET");
    await expect(page.locator("[data-content-edit-findbar]")).toContainText("1/3");

    const next = page.getByRole("button", { name: "下一个匹配", exact: true });
    for (const match of [expected[1], expected[2]]) {
      await next.click();
      await expect.poll(async () => (await editorState(page))?.start).toBe(match.start);
      await expect.poll(async () => (await editorState(page))?.end).toBe(match.end);
      const state = await editorState(page);
      expect(state).not.toBeNull();
      expect(state!.scrollTop).toBeGreaterThanOrEqual(0);
      expect(state!.scrollTop).toBeLessThanOrEqual(
        Math.max(0, state!.scrollHeight - state!.clientHeight),
      );
      expect(state!.value).toBe(body);
    }
    await expect.poll(async () => (await editorState(page))?.scrollTop).toBeGreaterThan(0);

    await page.setViewportSize({ width: 1200, height: 500 });
    await page.getByRole("button", { name: "上一个匹配", exact: true }).click();
    await expect.poll(async () => (await editorState(page))?.start).toBe(expected[1].start);
    await expect.poll(async () => (await editorState(page))?.end).toBe(expected[1].end);
    const resized = await editorState(page);
    expect(resized).not.toBeNull();
    expect(resized!.scrollTop).toBeGreaterThanOrEqual(0);
    expect(resized!.scrollTop).toBeLessThanOrEqual(
      Math.max(0, resized!.scrollHeight - resized!.clientHeight),
    );
    expect(resized!.value).toBe(body);
  } finally {
    await closeApp(app);
  }
});
