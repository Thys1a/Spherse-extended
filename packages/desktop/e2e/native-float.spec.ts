import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFileTreeProject, launchFileTreeApp, type TestProject } from "./helpers/file-tree";
import { closeApp } from "./helpers/electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const mainEntry = path.join(appRoot, "dist", "main", "index.js");
const rendererEntry = path.join(appRoot, "dist", "renderer", "index.html");

test.setTimeout(120_000);

async function floatFile(page: Page, name: string) {
  const sidebar = page.locator("aside");
  await sidebar.locator("button").filter({ hasText: new RegExp(`^${name}$`) }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "浮窗" }).click();
  await expect(page.locator("[data-content-float-root]")).toBeVisible({ timeout: 10_000 });
}

async function windowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

async function hasAlwaysOnTopWindow(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isAlwaysOnTop()),
  );
}

async function popOut(page: Page, app: ElectronApplication): Promise<Page> {
  const [floatPage] = await Promise.all([
    app.waitForEvent("window", { timeout: 15_000 }),
    page.locator("[data-content-float-popout]").click(),
  ]);
  await floatPage.setViewportSize({ width: 420, height: 600 });
  await expect(floatPage.locator("[data-float-titlebar]")).toContainText("README.md", { timeout: 30_000 });
  return floatPage;
}

test("pop-out opens a native always-on-top window and removes the overlay", async () => {
  const project = await createFileTreeProject();
  const { app, page } = await launchFileTreeApp(project);

  try {
    await floatFile(page, "README.md");
    const floatPage = await popOut(page, app);

    expect(await windowCount(app)).toBe(2);
    expect(await hasAlwaysOnTopWindow(app)).toBe(true);
    await expect(page.locator("[data-content-float-root]")).toHaveCount(0);
    await expect(floatPage.locator("[data-content-doc]")).toBeVisible({ timeout: 10_000 });
  } finally {
    await closeApp(app);
  }
});

test("dock restores the overlay in the main window", async () => {
  const project = await createFileTreeProject();
  const { app, page } = await launchFileTreeApp(project);

  try {
    await floatFile(page, "README.md");
    const floatPage = await popOut(page, app);

    await floatPage.locator("[data-float-dock]").click();
    await expect(page.locator("[data-content-float-root]")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => windowCount(app), { timeout: 10_000 }).toBe(1);
  } finally {
    await closeApp(app);
  }
});

test("plain close keeps the item closed without an overlay", async () => {
  const project = await createFileTreeProject();
  const { app, page } = await launchFileTreeApp(project);

  try {
    await floatFile(page, "README.md");
    const floatPage = await popOut(page, app);

    await floatPage.locator("[data-float-close]").click();
    await expect.poll(() => windowCount(app), { timeout: 10_000 }).toBe(1);
    await expect(page.locator("[data-content-float-root]")).toHaveCount(0);

    await floatFile(page, "README.md");
    await expect(page.locator("[data-content-float-root]")).toBeVisible({ timeout: 10_000 });
  } finally {
    await closeApp(app);
  }
});

test("closing the main window quits the app with floats open", async () => {
  const project = await createFileTreeProject();
  const { app, page } = await launchFileTreeApp(project);

  try {
    await page.evaluate(async () => {
      const current = await window.electronAPI.getDesktopPrefs();
      await window.electronAPI.saveDesktopPrefs({ ...current, closeToTray: false });
    });
    await floatFile(page, "README.md");
    await popOut(page, app);
    expect(await windowCount(app)).toBe(2);

    const exited = new Promise<void>((resolve) => app.process().once("exit", () => resolve()));
    await page.close();
    await exited;
  } finally {
    await closeApp(app);
  }
});

async function launchWithUserData(
  project: TestProject,
  userDataDir: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userDataDir}`],
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ELECTRON_ENABLE_LOGGING: "1",
      XDG_CONFIG_HOME: userDataDir,
    },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(
    async ({ id, projectRoot }) => {
      await window.electronAPI.openProject(projectRoot);
      await window.electronAPI.addOpenProject(id, projectRoot);
      await window.electronAPI.setLastActiveProject(id);
    },
    { id: project.projectId, projectRoot: project.root },
  );
  const projectUrl = `/project/${project.projectId}`;
  await page.goto(
    `file://${rendererEntry}?e2e=${Date.now()}#${projectUrl}/content?path=${encodeURIComponent("README.md")}`,
  );
  await page.waitForSelector("text=文件", { timeout: 30_000 });
  return { app, page };
}

test("restart restores the float window at its last bounds", async () => {  const project = await createFileTreeProject();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "spherse-e2e-native-float-user-"));
  const { app, page } = await launchWithUserData(project, userDataDir);
  let expected: { x: number; y: number; width: number; height: number } | undefined;

  try {
    await floatFile(page, "README.md");
    await popOut(page, app);

    const target = { x: 60, y: 60, width: 480, height: 640 };
    await app.evaluate(({ BrowserWindow }, bounds) => {
      const float = BrowserWindow.getAllWindows().find((w) => w.isAlwaysOnTop());
      float?.setBounds(bounds);
    }, target);
    await page.waitForTimeout(800);
    expected = await app.evaluate(({ BrowserWindow }) => {
      const float = BrowserWindow.getAllWindows().find((w) => w.isAlwaysOnTop());
      return float?.getBounds();
    });
  } finally {
    await closeApp(app);
  }

  let relaunch: ElectronApplication | undefined;
  try {
    const second = await launchWithUserData(project, userDataDir);
    relaunch = second.app;
    await expect.poll(() => windowCount(relaunch!), { timeout: 30_000 }).toBe(2);
    const bounds = await relaunch.evaluate(({ BrowserWindow }) => {
      const float = BrowserWindow.getAllWindows().find((w) => w.isAlwaysOnTop());
      return float?.getBounds();
    });
    expect(expected).toBeDefined();
    // Position restores exactly; size may differ by a few px because Windows
    // DWM accounts frameless-window chrome differently for constructor
    // options vs setBounds round-trips.
    expect(bounds?.x).toBe(expected?.x);
    expect(bounds?.y).toBe(expected?.y);
    expect(Math.abs((bounds?.width ?? 0) - (expected?.width ?? 0))).toBeLessThanOrEqual(10);
    expect(Math.abs((bounds?.height ?? 0) - (expected?.height ?? 0))).toBeLessThanOrEqual(10);
  } finally {
    await closeApp(relaunch);
  }
});

test("float window shares localStorage but does not disturb main project state", async () => {
  const project = await createFileTreeProject();
  const { app, page } = await launchFileTreeApp(project);

  try {
    await floatFile(page, "README.md");
    const beforeActive = await page.evaluate(() => window.electronAPI.getLastActiveProject());
    const beforeRoutes = await page.evaluate(() => {
      const out: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith("spherse:last-route:")) out[key] = localStorage.getItem(key);
      }
      return out;
    });
    await page.evaluate(() => localStorage.setItem("spherse:e2e-probe", "pong"));

    const floatPage = await popOut(page, app);
    expect(await floatPage.evaluate(() => localStorage.getItem("spherse:e2e-probe"))).toBe("pong");

    await floatPage.locator("[data-float-dock]").click();
    await expect(page.locator("[data-content-float-root]")).toBeVisible({ timeout: 10_000 });

    expect(await page.evaluate(() => window.electronAPI.getLastActiveProject())).toBe(beforeActive);
    const afterRoutes = await page.evaluate(() => {
      const out: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith("spherse:last-route:")) out[key] = localStorage.getItem(key);
      }
      return out;
    });
    expect(afterRoutes).toEqual(beforeRoutes);
  } finally {
    await closeApp(app);
  }
});

async function createSessionViaApi(page: Page, projectId: string, agentId: string): Promise<string> {
  const port: number = await page.evaluate(() => window.electronAPI.getServerPort());
  const token = (await page.evaluate(() => window.electronAPI.getMobileAccessState())).token ?? null;
  const res = await fetch(`http://localhost:${port}/api/projects/${projectId}/agents/${encodeURIComponent(agentId)}/sessions`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`createSession ${res.status}: ${JSON.stringify(body)}`);
  return (body as { sessionId: string }).sessionId;
}

test("chat pop-out renders in a native window and docks back", async () => {
  const project = await createFileTreeProject();
  const { app, page } = await launchFileTreeApp(project);

  try {
    const sessionId = await createSessionViaApi(page, project.projectId, "assistant");
    const opened = await page.evaluate(async ({ projectId, itemKey }) => {
      return window.electronAPI.floatWindowOpen({ kind: "chat", projectId, itemKey });
    }, { projectId: project.projectId, itemKey: sessionId });
    expect(opened).toEqual({ ok: true });
    expect(await windowCount(app)).toBe(2);
    expect(await hasAlwaysOnTopWindow(app)).toBe(true);

    const pages = app.windows();
    const floatPage = pages.length > 1 ? pages[1] : await app.waitForEvent("window", { timeout: 15_000 });
    await expect(floatPage.locator("[data-float-titlebar]")).toContainText("Assistant", { timeout: 30_000 });

    await floatPage.locator("[data-float-dock]").click();
    await expect(page.locator("[data-chat-float-root]")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => windowCount(app), { timeout: 10_000 }).toBe(1);
  } finally {
    await closeApp(app);
  }
});
