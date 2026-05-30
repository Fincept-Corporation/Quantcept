//! Quantcept computer-use sidecar.
//!
//! A long-lived process that speaks newline-delimited JSON-RPC on stdin/stdout (the contract
//! in `src/core/tools/computeruse/protocol.ts`). Each request is a batch of low-level input
//! primitives (move / button / scroll / text / key / wait) plus an optional post-action
//! screen capture; each response carries the (downscaled) PNG screenshot, the cursor
//! position, and the focused window title (which drives the TS-side money tripwire +
//! redaction). The protocol is structured-only — there is no shell/eval path.

use std::io::{self, BufRead, Write};

use base64::Engine as _;
use enigo::{
    Axis, Button, Coordinate, Direction as EnigoDir, Enigo, Key, Keyboard, Mouse, Settings,
};
use image::{DynamicImage, ImageFormat, imageops::FilterType};
use serde::{Deserialize, Serialize};
use xcap::Monitor;

mod marks;

#[derive(Deserialize)]
struct Request {
    id: u64,
    #[serde(default)]
    actions: Vec<Primitive>,
    #[serde(default)]
    capture: Option<CaptureRequest>,
    #[serde(default)]
    control: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Primitive {
    Move { x: i32, y: i32 },
    Button { button: String, direction: String },
    Scroll { axis: String, amount: i32 },
    Text { text: String },
    Key { key: String, direction: String },
    Wait { seconds: f64 },
}

#[derive(Deserialize)]
struct CaptureRequest {
    #[serde(default)]
    region: Option<Region>,
    #[serde(rename = "maxLongEdge", default)]
    max_long_edge: Option<u32>,
    #[serde(rename = "maxTotalPx", default)]
    max_total_px: Option<u64>,
    #[serde(default)]
    marks: bool,
}

#[derive(Deserialize)]
struct Region {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Serialize, Default)]
struct Response {
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    screenshot: Option<Screenshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cursor: Option<[i32; 2]>,
    #[serde(rename = "windowTitle", skip_serializing_if = "Option::is_none")]
    window_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    elements: Option<Vec<marks::MarkElement>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct Screenshot {
    data: String,
    width: u32,
    height: u32,
    #[serde(rename = "originalWidth")]
    original_width: u32,
    #[serde(rename = "originalHeight")]
    original_height: u32,
    /// Captured monitor's top-left in virtual-screen coords (image px + origin = physical px).
    #[serde(rename = "originX")]
    origin_x: i32,
    #[serde(rename = "originY")]
    origin_y: i32,
}

fn main() {
    set_dpi_awareness();
    let mut enigo = Enigo::new(&Settings::default()).ok();
    let stdin = io::stdin();
    let stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let req: Request = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(_) => continue, // drop malformed line, keep the loop alive
        };
        let resp = handle(&mut enigo, req);
        let mut out = stdout.lock();
        let _ = writeln!(out, "{}", serde_json::to_string(&resp).unwrap_or_else(|_| "{}".into()));
        let _ = out.flush();
    }
}

fn handle(enigo: &mut Option<Enigo>, req: Request) -> Response {
    let mut resp = Response { id: req.id, ..Default::default() };

    if req.control.as_deref() == Some("release_all") {
        if let Some(e) = enigo.as_mut() {
            release_all(e);
        }
        resp.window_title = foreground_window_title();
        return resp;
    }

    for action in &req.actions {
        if let Err(e) = perform(enigo, action) {
            resp.error = Some(e);
            return resp;
        }
    }

    if let Some(e) = enigo.as_ref() {
        if let Ok((x, y)) = e.location() {
            resp.cursor = Some([x, y]);
        }
    }

    if let Some(cap) = &req.capture {
        match capture(cap) {
            Ok((shot, elements)) => {
                resp.screenshot = Some(shot);
                resp.elements = elements;
            }
            Err(e) => resp.error = Some(e),
        }
    }
    resp.window_title = foreground_window_title();
    resp
}

fn perform(enigo: &mut Option<Enigo>, action: &Primitive) -> Result<(), String> {
    if let Primitive::Wait { seconds } = action {
        std::thread::sleep(std::time::Duration::from_secs_f64(seconds.max(0.0)));
        return Ok(());
    }
    let e = enigo.as_mut().ok_or_else(|| "input device not available".to_string())?;
    match action {
        Primitive::Move { x, y } => e.move_mouse(*x, *y, Coordinate::Abs).map_err(stringify)?,
        Primitive::Button { button, direction } => {
            e.button(parse_button(button)?, parse_dir(direction)?).map_err(stringify)?
        }
        Primitive::Scroll { axis, amount } => {
            let ax = if axis == "horizontal" { Axis::Horizontal } else { Axis::Vertical };
            e.scroll(*amount, ax).map_err(stringify)?
        }
        Primitive::Text { text } => e.text(text).map_err(stringify)?,
        Primitive::Key { key, direction } => {
            e.key(parse_key(key), parse_dir(direction)?).map_err(stringify)?
        }
        Primitive::Wait { .. } => unreachable!(),
    }
    Ok(())
}

fn stringify<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn parse_button(b: &str) -> Result<Button, String> {
    match b {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        other => Err(format!("unknown mouse button: {other}")),
    }
}

fn parse_dir(d: &str) -> Result<EnigoDir, String> {
    match d {
        "press" => Ok(EnigoDir::Press),
        "release" => Ok(EnigoDir::Release),
        "click" => Ok(EnigoDir::Click),
        other => Err(format!("unknown direction: {other}")),
    }
}

fn parse_key(k: &str) -> Key {
    // A single character types that character; named keys map to enigo's Key enum.
    let mut chars = k.chars();
    if let (Some(c), None) = (chars.next(), chars.clone().next()) {
        if k.chars().count() == 1 {
            return Key::Unicode(c);
        }
    }
    match k.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Key::Control,
        "shift" => Key::Shift,
        "alt" | "option" => Key::Alt,
        "meta" | "super" | "win" | "cmd" | "command" => Key::Meta,
        "return" | "enter" => Key::Return,
        "tab" => Key::Tab,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "escape" | "esc" => Key::Escape,
        "space" => Key::Space,
        "up" | "uparrow" => Key::UpArrow,
        "down" | "downarrow" => Key::DownArrow,
        "left" | "leftarrow" => Key::LeftArrow,
        "right" | "rightarrow" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        other => Key::Unicode(other.chars().next().unwrap_or(' ')),
    }
}

fn release_all(e: &mut Enigo) {
    for b in [Button::Left, Button::Right, Button::Middle] {
        let _ = e.button(b, EnigoDir::Release);
    }
    for k in [Key::Control, Key::Shift, Key::Alt, Key::Meta] {
        let _ = e.key(k, EnigoDir::Release);
    }
}

fn capture(cap: &CaptureRequest) -> Result<(Screenshot, Option<Vec<marks::MarkElement>>), String> {
    let monitors = Monitor::all().map_err(stringify)?;
    // Capture the monitor the foreground window is on (not always primary) so the screenshot,
    // the marks, and the click coordinates are all consistent on the active display.
    let fg = foreground_center();
    let monitor = fg
        .and_then(|(cx, cy)| {
            monitors.iter().find(|m| {
                let (mx, my) = (m.x().unwrap_or(0), m.y().unwrap_or(0));
                let (mw, mh) = (m.width().unwrap_or(0) as i32, m.height().unwrap_or(0) as i32);
                cx >= mx && cx < mx + mw && cy >= my && cy < my + mh
            })
        })
        .or_else(|| monitors.iter().find(|m| m.is_primary().unwrap_or(false)))
        .or_else(|| monitors.first())
        .ok_or_else(|| "no monitor found".to_string())?;
    let origin_x = monitor.x().unwrap_or(0);
    let origin_y = monitor.y().unwrap_or(0);

    let img = match &cap.region {
        Some(r) => monitor.capture_region(r.x, r.y, r.width, r.height).map_err(stringify)?,
        None => monitor.capture_image().map_err(stringify)?,
    };
    let original_width = img.width();
    let original_height = img.height();
    let scale = scale_factor(original_width, original_height, cap.max_long_edge, cap.max_total_px);

    let dynimg = DynamicImage::ImageRgba8(img);
    let mut scaled = if scale < 1.0 {
        let nw = ((original_width as f64 * scale).floor() as u32).max(1);
        let nh = ((original_height as f64 * scale).floor() as u32).max(1);
        dynimg.resize_exact(nw, nh, FilterType::Lanczos3)
    } else {
        dynimg
    };

    let elements = if cap.marks {
        let mut rgba = scaled.to_rgba8();
        let els = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            marks::draw_grid_and_marks(&mut rgba, 80, scale, origin_x, origin_y)
        }))
        .unwrap_or_default();
        if !els.is_empty() {
            scaled = DynamicImage::ImageRgba8(rgba);
            Some(els)
        } else {
            None
        }
    } else {
        None
    };

    let mut buf = std::io::Cursor::new(Vec::new());
    scaled.write_to(&mut buf, ImageFormat::Png).map_err(stringify)?;
    let data = base64::engine::general_purpose::STANDARD.encode(buf.get_ref());

    Ok((
        Screenshot {
            data,
            width: scaled.width(),
            height: scaled.height(),
            original_width,
            original_height,
            origin_x,
            origin_y,
        },
        elements,
    ))
}

/// min(maxLong/long, sqrt(maxTotal/total), 1.0) — never upscales. Matches `scale.ts`.
fn scale_factor(w: u32, h: u32, max_long: Option<u32>, max_total: Option<u64>) -> f64 {
    let long = w.max(h) as f64;
    let total = (w as u64 * h as u64) as f64;
    let mut f = 1.0_f64;
    if let Some(ml) = max_long {
        if long > 0.0 {
            f = f.min(ml as f64 / long);
        }
    }
    if let Some(mt) = max_total {
        if total > 0.0 {
            f = f.min((mt as f64 / total).sqrt());
        }
    }
    f.min(1.0)
}

#[cfg(windows)]
fn set_dpi_awareness() {
    use windows::Win32::UI::HiDpi::{
        DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext,
    };
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
}

#[cfg(not(windows))]
fn set_dpi_awareness() {}

#[cfg(windows)]
fn foreground_window_title() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }
        let mut buf = vec![0u16; (len + 1) as usize];
        let n = GetWindowTextW(hwnd, &mut buf);
        if n <= 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..n as usize]))
    }
}

#[cfg(not(windows))]
fn foreground_window_title() -> Option<String> {
    None
}

#[cfg(windows)]
fn foreground_center() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut r = RECT::default();
        if GetWindowRect(hwnd, &mut r).is_ok() {
            Some(((r.left + r.right) / 2, (r.top + r.bottom) / 2))
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
fn foreground_center() -> Option<(i32, i32)> {
    None
}
