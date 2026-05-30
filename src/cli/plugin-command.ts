import { PluginManager } from "@core/plugins"

const out = (s: string): void => {
  process.stdout.write(`${s}\n`)
}

/** Headless `quantcept plugin …` verb: manage marketplaces + plugins without the TUI. */
export async function runPluginCli(action: string | undefined, rest: string[]): Promise<void> {
  const mgr = new PluginManager({ projectDir: process.cwd() })

  switch (action) {
    case undefined:
    case "list": {
      const installed = mgr.listInstalled()
      if (!installed.length) {
        out("No plugins installed. Try: quantcept plugin install <name@marketplace|source>")
        return
      }
      for (const p of installed) {
        out(`- ${p.name}${p.enabled ? "" : " (disabled)"}${p.marketplace ? ` @${p.marketplace}` : ""}  ${p.dir}`)
      }
      return
    }
    case "install": {
      if (!rest.length) return out("usage: quantcept plugin install <name@marketplace|source>")
      const p = await mgr.install(rest.join(" "))
      return out(`Installed "${p.name}"${p.version ? ` v${p.version}` : ""} → ${p.dir}`)
    }
    case "uninstall": {
      if (!rest[0]) return out("usage: quantcept plugin uninstall <name>")
      await mgr.uninstall(rest[0])
      return out(`Uninstalled ${rest[0]}`)
    }
    case "enable": {
      if (!rest[0]) return out("usage: quantcept plugin enable <name>")
      mgr.enable(rest[0])
      return out(`Enabled ${rest[0]}`)
    }
    case "disable": {
      if (!rest[0]) return out("usage: quantcept plugin disable <name>")
      mgr.disable(rest[0])
      return out(`Disabled ${rest[0]}`)
    }
    case "marketplace": {
      const [msub, ...mrest] = rest
      if (msub === "add") {
        if (!mrest.length) return out("usage: quantcept plugin marketplace add <source>")
        const mp = await mgr.addMarketplace(mrest.join(" "))
        return out(`Added marketplace "${mp.name}" (${mp.plugins.length} plugin(s))`)
      }
      if (msub === "remove") {
        if (!mrest[0]) return out("usage: quantcept plugin marketplace remove <name>")
        mgr.removeMarketplace(mrest[0])
        return out(`Removed marketplace ${mrest[0]}`)
      }
      const ms = mgr.listMarketplaces()
      if (!ms.length) return out("No marketplaces. Try: quantcept plugin marketplace add <source>")
      for (const m of ms) out(`- ${m.name}`)
      return
    }
    default:
      return out(`Unknown plugin action: ${action}. Try: list | install | uninstall | enable | disable | marketplace`)
  }
}
