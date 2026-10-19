import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveWindowIconPath } from "./window-icon.js";

describe("resolveWindowIconPath", () => {
  it("uses the multi-size ico on Windows, packaged or not", () => {
    expect(
      resolveWindowIconPath({
        platform: "win32",
        isPackaged: true,
        resourcesPath: "/res",
        appPath: "/app",
      }),
    ).toBe(path.join("/res", "spherse-icon.ico"));
    expect(
      resolveWindowIconPath({
        platform: "win32",
        isPackaged: false,
        resourcesPath: "/res",
        appPath: "/app",
      }),
    ).toBe(path.join("/app", "build", "spherse-icon.ico"));
  });

  it("points at extraResources in packaged builds", () => {
    expect(
      resolveWindowIconPath({
        platform: "linux",
        isPackaged: true,
        resourcesPath: "/res",
        appPath: "/app",
      }),
    ).toBe(path.join("/res", "spherse-icon.png"));
  });

  it("points at the package build dir in dev", () => {
    expect(
      resolveWindowIconPath({
        platform: "linux",
        isPackaged: false,
        resourcesPath: "/res",
        appPath: "/app",
      }),
    ).toBe(path.join("/app", "build", "spherse-icon.png"));
  });
});
