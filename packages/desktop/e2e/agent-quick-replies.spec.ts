import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { closeApp } from "./helpers/electron";
import {
  createChatProject,
  launchChatApp,
  createSessionViaApi,
  navigateToSession,
} from "./helpers/chat";

test.setTimeout(60_000);

async function seedQuickReplyAgent(project: { root: string }): Promise<void> {
  await writeFile(
    path.join(project.root, ".spherse", "agents", "assistant", "profile.md"),
    [
      "---",
      "id: assistant-1",
      "name: Assistant",
      "type: assistant",
      "model: deepseek-v4-flash",
      "tools: []",
      "quickReplies:",
      "  - label: Ping",
      "    description: Send a ping",
      "    text: ping me",
      "    action: fill",
      "---",
      "You help with everything.",
      "",
    ].join("\n"),
  );
}

test("chat quick reply button fills the composer input", async () => {
  const project = await createChatProject();
  await seedQuickReplyAgent(project);
  const { app, page } = await launchChatApp(project);

  try {
    const sessionId = await createSessionViaApi(page, project.projectId, "assistant-1");
    await navigateToSession(page, project.projectId, sessionId);

    const reply = page.locator("[data-chat-quick-replies] button", { hasText: /^Ping$/ });
    await expect(reply).toBeVisible({ timeout: 5000 });

    await reply.click();
    await expect(page.locator("[data-chat-composer] textarea")).toHaveValue("ping me", {
      timeout: 5000,
    });
  } finally {
    await closeApp(app);
  }
});
