export function resolveAppUserModelId(options: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
}): string | null {
  if (options.platform === "win32" && options.isPackaged) {
    return "com.spherse.app";
  }
  return null;
}
