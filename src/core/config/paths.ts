import os from "os"
import path from "path"

export const CONFIG_DIR_NAME = ".quantcept"

export function userConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME)
}

export function projectConfigDir(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_DIR_NAME)
}

export function userSettingsFile(): string {
  return path.join(userConfigDir(), "settings.json")
}

export function projectSettingsFile(cwd?: string): string {
  return path.join(projectConfigDir(cwd), "settings.json")
}
