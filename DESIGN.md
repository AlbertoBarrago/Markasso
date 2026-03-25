# Markasso — Design Reference

## Concept

The Markasso UI theme is inspired by Pablo Picasso's **Le Rêve** (The Dream, 1932).
The palette draws from the painting's bold, saturated tones — deep crimsons, forest greens, gold, slate blue — darkened and desaturated to serve a professional dark-mode canvas application.

---

## Color Palette

### Source painting: Le Rêve (Picasso, 1932)

| Role in painting        | Raw color   | Notes                            |
|-------------------------|-------------|----------------------------------|
| Armchair / vivid red    | `#C42020`   | Primary accent                   |
| Wallpaper / deep red    | `#7A1A1A`   | Darker accent, active states     |
| Bordeaux shadow         | `#3D0A0A`   | Deep UI backgrounds              |
| Background stripes      | `#2D5A27`   | Forest green (secondary palette) |
| Dark foliage            | `#1A3314`   | Deep green shadow                |
| Necklace / amber        | `#C8931A`   | Gold highlight (future use)      |
| Skirt / slate blue      | `#3D6070`   | Cool contrast (future use)       |

### Applied to the UI

| CSS variable        | Value                      | Usage                                 |
|---------------------|----------------------------|---------------------------------------|
| `--accent`          | `#c42020`                  | Active tools, selections, focus rings |
| `--accent-light`    | `rgba(196,32,32,0.18)`     | Active button fill                    |
| `--bg-island`       | `rgba(22, 12, 12, 0.97)`   | Toolbar islands, panels               |
| `--island-border`   | `rgba(255,255,255,0.08)`   | Island outlines                       |
| `--island-shadow`   | multi-layer                | Depth / elevation                     |
| `--bg-hover`        | `rgba(255,255,255,0.07)`   | Hover states                          |
| `--border`          | `rgba(255,255,255,0.08)`   | Dividers, input borders               |
| `--text`            | `#e8d4d4`                  | Primary text (warm off-white)         |
| `--text-muted`      | `rgba(232,212,212,0.45)`   | Secondary / hint text                 |
| Canvas background   | `#120a0a`                  | Deep warm near-black workspace        |
| Context panel bg    | `#1d1212`                  | Properties panel                      |
| Slider / active btn | `#9b1717`                  | Form controls in active state         |

### Hardcoded accent values in CSS

These appear inline rather than via variable (legacy, to be consolidated):

| Value            | Replaces           | Location                          |
|------------------|--------------------|-----------------------------------|
| `#c42020`        | was `#7c63d4`      | Swatch active border, slider      |
| `#9b1717`        | was `#5c4fa3`      | Btn active border, slider thumb   |
| `rgba(155,23,23,0.35)` | was `rgba(92,79,163,0.35)` | Active button fill       |
| `rgba(196,32,32,0.12)` | was `rgba(124,99,212,0.12)` | Font size input focus   |

---

## Typography

- Font: `system-ui, -apple-system, sans-serif`
- Primary text: `#e8d4d4` — warm white, derived from the painting's cream skin tones
- Muted text: 45% opacity of the primary text color

---

## Geometry

| Token              | Value  | Usage                     |
|--------------------|--------|---------------------------|
| `--island-radius`  | `12px` | Floating islands          |
| `--radius`         | `8px`  | Buttons, inputs, swatches |
| Island padding     | `4px`  | Internal button spacing   |

---

## Design principles

- **Dark first.** The canvas is the hero. All UI chrome fades into the background.
- **Warm shadows.** Island backgrounds use `rgba(22, 12, 12, …)` — a dark warm near-black — rather than cool blue-grays, echoing the deep reds of the painting.
- **One accent.** Crimson `#c42020` is the single highlight color for interactive focus, selection, and active states. No competing hues in the chrome.
- **Restraint.** The gold and slate blue from the painting are reserved as future accent possibilities, not currently used in the UI, to avoid visual noise.
