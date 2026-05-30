# quantcept-computeruse (capture + input sidecar)

A small, self-contained binary that gives Quantcept's agent OS-level "computer use" — screen
capture + mouse/keyboard synthesis — behind a newline-delimited JSON-RPC protocol on
stdin/stdout. The protocol is defined in `src/core/tools/computeruse/protocol.ts` and consumed
by `SpawnSidecarClient`. Built on [`xcap`](https://crates.io/crates/xcap) (capture, incl.
Wayland) + [`enigo`](https://crates.io/crates/enigo) (input).

The protocol is **structured-only** — it accepts typed action objects, never a shell string.

## Build

### Windows (GNU toolchain — self-contained, no Visual Studio needed)

The `windows` crate (pulled in by xcap/enigo) needs mingw's `dlltool` to generate import
libraries, and we static-link the mingw runtime so the binary ships as a single `.exe` that
depends only on OS DLLs (no `libwinpthread`/`libgcc`).

```powershell
# dlltool + as for the windows crate's import libs (any mingw-w64 bin dir works)
$env:PATH = "C:\msys64\ucrt64\bin;$env:PATH"
# static-link the mingw runtime -> single self-contained exe
$env:RUSTFLAGS = "-C target-feature=+crt-static"
cargo build --release
```

Output: `target/release/quantcept-computeruse.exe` (~0.5 MB; imports only `KERNEL32`,
`user32`, `gdi32`, `advapi32`, `oleaut32`, `ntdll`, and the UCRT api-sets present on Win10+).
Verified standalone (runs with no MSYS2 on PATH).

Prereqs: Rust ≥ 1.87 (`rustup default stable`) and a mingw-w64 `dlltool` (MSYS2:
`pacman -S mingw-w64-ucrt-x86_64-binutils`, or any WinLibs/mingw distribution on PATH).

### macOS / Linux

```sh
cargo build --release   # macOS needs Screen Recording + Accessibility (TCC) permission at runtime
```

Build each target on its native OS (xcap/enigo link platform frameworks — don't cross-compile).
For distribution, publish per-platform binaries the same way the main app does
(`optionalDependencies` + the `bin/quantcept` launcher) and point `resolveSidecarBinary` at them
(or set `QUANTCEPT_COMPUTERUSE_BIN`).

## Protocol (one JSON object per line)

Request: `{ "id", "actions": Primitive[], "capture"?: {region?, maxLongEdge?, maxTotalPx?},
"control"?: "release_all" }`
Response: `{ "id", "screenshot"?: {data(b64 png), width, height, originalWidth, originalHeight},
"cursor"?: [x,y], "windowTitle"?, "error"? }`

Primitives: `move{x,y}`, `button{button,direction}`, `scroll{axis,amount}`, `text{text}`,
`key{key,direction}`, `wait{seconds}`. Coordinates are physical pixels.
