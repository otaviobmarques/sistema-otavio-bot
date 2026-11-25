// main.mjs imports this first: everything after it reads OMB_* settings, the profile folder and the AppUserModelId.
import "./env-aliases.mjs";
import { app } from "electron";
import { pinnedUserData } from "./data-dir.mjs";

/** electron-builder.yml's appId: the Start menu shortcut the installer makes carries it, so toasts and the taskbar
 * show that shortcut's name and icon. */
export const WINDOWS_APP_USER_MODEL_ID = "com.openmausbot.app";

if (app.isPackaged) {
  const current = app.getPath("userData");
  const pinned = pinnedUserData({ appData: app.getPath("appData"), current });
  if (pinned !== current) {
    const sessionFollows = app.getPath("sessionData") === current;
    app.setPath("userData", pinned);
    if (sessionFollows) app.setPath("sessionData", pinned);
  }
  if (process.platform === "win32") app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
}
