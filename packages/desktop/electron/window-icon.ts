import path from "node:path";

export function resolveWindowIconPath(options: {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
}): string {
  const file = options.platform === "win32" ? "spherse-icon.ico" : "spherse-icon.png";
  if (options.isPackaged) return path.join(options.resourcesPath, file);
  return path.join(options.appPath, "build", file);
}
