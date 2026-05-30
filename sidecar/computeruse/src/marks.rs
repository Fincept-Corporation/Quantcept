//! Set-of-Marks: enumerate interactable UI elements (Windows UI Automation) and draw numbered
//! boxes on the screenshot, so the vision model can click element #N instead of guessing pixels.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct MarkElement {
    pub mark: u32,
    /// Physical screen center of the element (what we actually click).
    pub x: i32,
    pub y: i32,
    pub label: String,
}

/// (mark, physical rect left/top/right/bottom) collected from UI Automation.
pub type MarkItem = (MarkElement, (i32, i32, i32, i32));

#[cfg(windows)]
thread_local! {
    // Reuse one UIAutomation client across calls: avoids re-initializing COM every capture and
    // keeps a persistent a11y client, which nudges Chrome/Electron to expose their UIA tree.
    static AUTOMATION: std::cell::RefCell<Option<uiautomation::UIAutomation>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(windows)]
pub fn enumerate_marks(max_marks: usize) -> Vec<MarkItem> {
    AUTOMATION.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_none() {
            *borrow = uiautomation::UIAutomation::new().ok();
        }
        match borrow.as_ref() {
            Some(a) => enumerate_with(a, max_marks),
            None => Vec::new(),
        }
    })
}

#[cfg(windows)]
fn enumerate_with(automation: &uiautomation::UIAutomation, max_marks: usize) -> Vec<MarkItem> {
    use uiautomation::controls::ControlType;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let mut out: Vec<MarkItem> = Vec::new();
    let hwnd = unsafe { GetForegroundWindow() };
    let root = if hwnd.0.is_null() {
        automation.get_root_element().ok()
    } else {
        automation
            .element_from_handle(uiautomation::types::Handle::from(hwnd.0 as isize))
            .ok()
            .or_else(|| automation.get_root_element().ok())
    };
    let root = match root {
        Some(r) => r,
        None => return out,
    };
    let walker = match automation.get_control_view_walker() {
        Ok(w) => w,
        Err(_) => return out,
    };

    let interactable = |ct: ControlType| {
        matches!(
            ct,
            ControlType::Button
                | ControlType::Hyperlink
                | ControlType::Edit
                | ControlType::MenuItem
                | ControlType::ListItem
                | ControlType::CheckBox
                | ControlType::RadioButton
                | ControlType::ComboBox
                | ControlType::TabItem
                | ControlType::SplitButton
                | ControlType::TreeItem
        )
    };

    let mut stack: Vec<(uiautomation::UIElement, usize)> = vec![(root, 0usize)];
    let mut visited = 0usize;
    let mut next_mark = 1u32;
    while let Some((el, depth)) = stack.pop() {
        if visited >= 4000 || out.len() >= max_marks {
            break;
        }
        visited += 1;
        if !el.is_offscreen().unwrap_or(true) {
            if let Ok(ct) = el.get_control_type() {
                if interactable(ct) {
                    if let Ok(r) = el.get_bounding_rectangle() {
                        let (l, t, ri, b) = (r.get_left(), r.get_top(), r.get_right(), r.get_bottom());
                        let (w, h) = (ri - l, b - t);
                        if w > 2 && h > 2 && w < 2400 && h < 2000 {
                            let mut name = el.get_name().unwrap_or_default();
                            if name.len() > 40 {
                                name.truncate(40);
                            }
                            out.push((
                                MarkElement { mark: next_mark, x: l + w / 2, y: t + h / 2, label: name },
                                (l, t, ri, b),
                            ));
                            next_mark += 1;
                        }
                    }
                }
            }
        }
        if depth < 40 {
            if let Ok(child) = walker.get_first_child(&el) {
                let mut cur = child;
                loop {
                    stack.push((cur.clone(), depth + 1));
                    match walker.get_next_sibling(&cur) {
                        Ok(n) => cur = n,
                        Err(_) => break,
                    }
                    if stack.len() > 8000 {
                        break;
                    }
                }
            }
        }
    }
    out
}

#[cfg(not(windows))]
pub fn enumerate_marks(_max_marks: usize) -> Vec<MarkItem> {
    Vec::new()
}

#[cfg(windows)]
fn load_font() -> Option<ab_glyph::FontVec> {
    for p in [
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\consolab.ttf",
    ] {
        if let Ok(bytes) = std::fs::read(p) {
            if let Ok(f) = ab_glyph::FontVec::try_from_vec(bytes) {
                return Some(f);
            }
        }
    }
    None
}

/// Draw numbered boxes onto the (already downscaled) image. `scale` maps physical→image pixels;
/// `origin_x/y` is the captured monitor's top-left in virtual-screen coordinates.
#[cfg(windows)]
pub fn draw_marks(img: &mut image::RgbaImage, items: &[MarkItem], origin_x: i32, origin_y: i32, scale: f64) {
    use ab_glyph::PxScale;
    use image::Rgba;
    use imageproc::drawing::{draw_filled_rect_mut, draw_hollow_rect_mut, draw_text_mut};
    use imageproc::rect::Rect;

    let font = match load_font() {
        Some(f) => f,
        None => return,
    };
    let red = Rgba([255u8, 40, 40, 255]);
    let white = Rgba([255u8, 255, 255, 255]);
    let imgw = img.width() as i32;
    let imgh = img.height() as i32;

    for (el, (l, t, r, b)) in items {
        let lx = (((*l - origin_x) as f64) * scale).round() as i32;
        let ty = (((*t - origin_y) as f64) * scale).round() as i32;
        let rx = (((*r - origin_x) as f64) * scale).round() as i32;
        let by = (((*b - origin_y) as f64) * scale).round() as i32;
        if rx <= 0 || by <= 0 || lx >= imgw || ty >= imgh {
            continue;
        }
        let x0 = lx.max(0);
        let y0 = ty.max(0);
        let w = (rx - x0).clamp(1, imgw - x0).max(1) as u32;
        let h = (by - y0).clamp(1, imgh - y0).max(1) as u32;
        draw_hollow_rect_mut(img, Rect::at(x0, y0).of_size(w, h), red);
        let label = el.mark.to_string();
        let bw = (label.len() as u32) * 9 + 4;
        draw_filled_rect_mut(img, Rect::at(x0, y0).of_size(bw.max(12), 16), red);
        draw_text_mut(img, white, x0 + 2, y0, PxScale::from(15.0), &font, &label);
    }
}

#[cfg(not(windows))]
pub fn draw_marks(_img: &mut image::RgbaImage, _items: &[MarkItem], _ox: i32, _oy: i32, _s: f64) {}

/// Universal Set-of-Marks: overlay a labeled grid (works on any pixels, incl. Chrome where UIA
/// fails). Draws thin grid lines + a small number in each cell's corner, and returns each cell's
/// PHYSICAL center for clicking. `scale` maps image→physical; `origin` is the captured monitor.
#[cfg(windows)]
pub fn draw_grid_and_marks(
    img: &mut image::RgbaImage,
    cell_px: u32,
    scale: f64,
    origin_x: i32,
    origin_y: i32,
) -> Vec<MarkElement> {
    use ab_glyph::PxScale;
    use image::Rgba;
    use imageproc::drawing::{draw_filled_rect_mut, draw_line_segment_mut, draw_text_mut};
    use imageproc::rect::Rect;

    let font = match load_font() {
        Some(f) => f,
        None => return Vec::new(),
    };
    let (w, h) = (img.width(), img.height());
    let cell = cell_px.max(24);
    let cols = ((w + cell - 1) / cell).max(1);
    let rows = ((h + cell - 1) / cell).max(1);
    let line = Rgba([255u8, 220, 0, 255]);
    let bg = Rgba([0u8, 0, 0, 255]);
    let txt = Rgba([255u8, 220, 0, 255]);

    for c in 1..cols {
        let x = (c * cell) as f32;
        draw_line_segment_mut(img, (x, 0.0), (x, h as f32), line);
    }
    for r in 1..rows {
        let y = (r * cell) as f32;
        draw_line_segment_mut(img, (0.0, y), (w as f32, y), line);
    }

    let mut out = Vec::new();
    let mut n = 1u32;
    let to_phys = |v: u32, origin: i32| ((v as f64 / scale).round() as i32) + origin;
    for r in 0..rows {
        for c in 0..cols {
            let il = c * cell;
            let it = r * cell;
            let ir = ((c + 1) * cell).min(w);
            let ib = ((r + 1) * cell).min(h);
            let cx = (il + ir) / 2;
            let cy = (it + ib) / 2;
            out.push(MarkElement {
                mark: n,
                x: to_phys(cx, origin_x),
                y: to_phys(cy, origin_y),
                label: String::new(),
            });
            let label = n.to_string();
            let bw = (label.len() as u32) * 8 + 3;
            draw_filled_rect_mut(img, Rect::at(il as i32, it as i32).of_size(bw.max(10), 13), bg);
            draw_text_mut(img, txt, il as i32 + 1, it as i32, PxScale::from(12.0), &font, &label);
            n += 1;
        }
    }
    out
}

#[cfg(not(windows))]
pub fn draw_grid_and_marks(_img: &mut image::RgbaImage, _c: u32, _s: f64, _ox: i32, _oy: i32) -> Vec<MarkElement> {
    Vec::new()
}
