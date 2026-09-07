import { app } from "electron";
import path from "node:path";

if (!app.isPackaged && process.env.NODE_ENV !== "test") {
  const defaultUserData = app.getPath("userData");
  const dirName = process.env.SPHERSE_DEV_ISOLATE === "1" ? "Spherse-Dev" : "Spherse";
  app.setPath("userData", path.join(path.dirname(defaultUserData), dirName));
}

import("./main.js");
