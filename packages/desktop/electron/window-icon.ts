import path from "node:path";

export function resolveWindowIconPath(options: {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
}): string | undefined {
  if (options.platform === "win32") return undefined;
  if (options.isPackaged) return path.join(options.resourcesPath, "spherse-icon.png");
  return path.join(options.appPath, "build", "spherse-icon.png");
}
