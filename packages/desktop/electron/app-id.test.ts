import { describe, expect, it } from "vitest";
import { resolveAppUserModelId } from "./app-id.js";

describe("resolveAppUserModelId", () => {
  it("returns the production id for packaged Windows builds", () => {
    expect(resolveAppUserModelId({ isPackaged: true, platform: "win32" })).toBe(
      "com.spherse.app",
    );
  });

  it("returns null for dev runs so they never share the installed app group", () => {
    expect(resolveAppUserModelId({ isPackaged: false, platform: "win32" })).toBeNull();
  });

  it("returns null on other platforms", () => {
    expect(resolveAppUserModelId({ isPackaged: true, platform: "darwin" })).toBeNull();
    expect(resolveAppUserModelId({ isPackaged: true, platform: "linux" })).toBeNull();
  });
});
