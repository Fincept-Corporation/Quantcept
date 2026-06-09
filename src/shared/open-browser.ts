/** Open a URL in the user's default browser. Cross-platform; best-effort (never throws). */
export async function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url]
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" })
  } catch {
    /* headless / no browser — caller falls back to a manual-URL message */
  }
}
