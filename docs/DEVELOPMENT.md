# FLOAT v2.0.0 Developer Guide & Architecture Reference

This document provides architectural documentation, build instructions, and IPC reference for developers working on the **FLOAT** codebase.

---

## 1. Prerequisites

- **Operating System**: Windows 10 (Build 17763+) or Windows 11
- **Node.js**: v18.0 or higher (v20+ recommended)
- **Rust**: 1.75.0 or higher (`cargo`, `rustc`)
- **C++ Build Tools**: Visual Studio 2022 C++ Build Tools (with Windows 10/11 SDK)
- **Microsoft Edge WebView2 Runtime**

---

## 2. Repository Structure

```
FLOAT/
├── .vscode/                # Recommended IDE extensions
├── docs/                   # Documentation
│   ├── USER_GUIDE.md       # End-user manual
│   └── DEVELOPMENT.md      # Developer & architecture guide
├── scripts/                # Packaging and build automation
│   └── package-msix.ps1    # Automated MSIX packager with dynamic SDK discovery
├── src/                    # React 19 Frontend
│   ├── components/float/   # UI Components
│   │   ├── FloatPill.tsx   # Compact island resting / media / preview component
│   │   ├── FloatOrb.tsx    # 48x48 ambient orb component
│   │   ├── FloatSurface.tsx# Expanded surface with 3-tab navigation
│   │   ├── FloatNotificationsView.tsx # Scrollable notification deck
│   │   ├── FloatSettingsView.tsx      # Visual customization & preferences
│   │   ├── FloatShell.tsx  # Central island state machine & window manager
│   │   └── mediaTimeline.ts# Client-side high-precision playback interpolator
│   ├── platform/           # Tauri IPC bindings & types
│   │   ├── index.ts        # Platform command exports
│   │   └── media.ts        # Media session types & events
│   ├── activities/         # Live-activity model, timer and task stores
│   ├── island/             # shape.ts: the island's vector outline
│   │   ├── types.ts        # Activity kinds and priorities
│   │   └── useActivities.ts# Ongoing + transient activity stack (primary / split bubble)
│   ├── services/           # Settings persistence and CSS custom properties
│   │   └── settings.ts     # localStorage settings store & listeners
│   ├── App.tsx             # Root component
│   ├── index.css           # Global glass design tokens and utility styles
│   └── main.tsx            # Application entry point
├── src-tauri/               # Rust Backend (Tauri 2.0)
│   ├── icons/              # Application and AppX visual assets
│   ├── src/
│   │   ├── appicon.rs      # App icons by AUMID via shell:AppsFolder, cached as PNG
│   │   ├── autostart.rs    # Launch at startup (MSIX StartupTask / HKCU Run key)
│   │   ├── backdrop.rs     # Native composition backdrop window for real glass
│   │   ├── calendar.rs     # Next events from an ICS link (rrule expansion)
│   │   ├── brightness.rs   # Built-in display brightness via WMI (poll + set)
│   │   ├── clipboard.rs    # In-memory clipboard history (text + images)
│   │   ├── connectivity.rs # Wi-Fi / Bluetooth radios, SSID, connected devices
│   │   ├── focus.rs        # Focus Assist status command
│   │   ├── lyrics.rs       # LRCLIB synced lyrics (opt-in network)
│   │   ├── lib.rs          # Plugin, command and module wiring
│   │   ├── main.rs         # Application binary entry point
│   │   ├── media.rs        # Windows GSMTC media session monitoring
│   │   ├── notifications.rs# Windows UserNotificationListener events (with polling fallback)
│   │   ├── shelf.rs        # File shelf persistence, thumbnails, open/reveal
│   │   ├── sysmon.rs       # Volume, battery and camera/mic polling
│   │   ├── sysstats.rs     # CPU / memory / network speed, sampled on demand
│   │   ├── tray.rs         # Tray icon, global hotkey, island commands
│   │   ├── visualizer.rs   # WASAPI loopback capture -> 3-band audio levels
│   │   ├── volume.rs       # System volume via Core Audio
│   │   ├── weather.rs      # Open-Meteo current weather (opt-in network)
│   │   └── window.rs       # Fixed click-through window, hit testing, fullscreen hide, position memory
│   ├── Cargo.toml          # Rust dependencies & crate metadata
│   └── tauri.conf.json     # Tauri window & bundle configuration
├── .gitignore
├── CONTRIBUTING.md         # Guidelines for contributors
├── LICENSE                 # MIT License
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Frontend Architecture

### State Machine (`FloatShell.tsx`)
The root UI controller maintains four primary visual modes:
1. `"compact"`: Resting 240 × 48 px pill (or active media pill).
2. `"compactPreview"`: Hover-expanded pill revealing quick playback buttons.
3. `"orb"`: Ambient 48 × 48 px circular sphere.
4. `"expanded"`: 460 × 330 px interactive surface.

### Layout & Physics
All visual mode transitions share a unified Framer Motion spring configuration (`stiffness: 380, damping: 34, mass: 0.85`), ensuring physical object continuity (the Island morphs as a single physical entity).

### Window Model
The island lives in a single fixed 500 × 400 transparent window anchored at the top of the screen. The native window is never resized; all morphs are CSS springs inside it.

`FloatShell` reports the island's current shape (and split bubble, if any) to Rust via `set_hit_regions`. While a morph is running it reports the union of the old and new shapes, then the settled shape once the spring finishes. A monitor thread in `window.rs` hit-tests the cursor against those regions at ~60 Hz and toggles `set_ignore_cursor_events`, so the window is click-through everywhere outside the island. Because the webview stops receiving mouse events when click-through, hover is driven by the native `island-hover` event rather than DOM pointer events.

Keep `WINDOW_WIDTH` / `ISLAND_TOP` in `FloatShell.tsx` in sync with `WINDOW_WIDTH` in `window.rs` and `#root`'s `padding-top` in `index.css`.

### Notch Geometry
The island is flush with the top edge (only the orb floats, `ORB_TOP`). `FloatShell` derives width, height and per-corner radii from the visual mode and the primary activity (`NOTCH_IDLE_*`, `ACTIVITY_HEIGHT`, `PREVIEW_HEIGHT`, `NOTIFICATION_*`). Morphs and the press squish use `transform-origin: 50% 0%` so the notch never detaches from the edge. The concave "ears" are two radial-gradient spans beside the shell, shown only in the solid Notch style.

Morph springs come from `MORPH_SPRINGS[animationIntensity]`.

### Design System
`index.css` defines the scales every view uses: type (`--t-*`), spacing (`--s-*`), radii (`--r-tile`, `--r-control`), fills (`--fill-1..3`), text (`--text-1..3`) and semantic colors. `ui.css` holds the shared building blocks (`.view`, `.view-header`, `.segmented`, `.chip`, `.round-btn`). Typeface is Inter (bundled via `@fontsource-variable/inter`); icons come from `lucide-react`. New UI should use these rather than one-off values, and add color only when it carries meaning.

### Island Outline
The island is not a rounded rectangle. `island/shape.ts` builds one SVG path with Apple-style continuous corners (circular arcs eased by Bezier segments, Figma's corner smoothing at 60%) and, when docked, the concave ears. `FloatShell` animates `--island-top-r`, `--island-bottom-r` and `--island-ear` as numbers and redraws the path on every frame (`syncFrame` -> `drawFrame`): the fill, gloss and rim paths, the content `clip-path`, and the native blur backdrop.

### Expanded Panel
`FloatSurface` renders the bar from `LEFT_TABS` / `RIGHT_TABS` and `TABS`; add a tab by extending `SurfaceTab`, `TABS` and the `body` switch. `settings` has no bar icon and opens from Controls. Home (`HomeView`) is deliberately minimal: the horizontal `MediaWidgetSurface` (with `CurrentLyric` as its `subline`) or a clock, plus `HomeLine`. Keep new features in their own tab rather than adding to Home.

Timer state lives in `activities/timerStore.ts` (wall-clock based, outside React); a running timer is passed to `useActivities` as an ongoing activity. Tasks live in `activities/tasksStore.ts` (localStorage).

### Background Threads
Each native monitor owns its thread and only emits on change: `window.rs` (cursor hit testing, ~60 Hz), `sysmon.rs` (volume 10 Hz, battery 5 Hz, camera/mic 1 Hz), `connectivity.rs` (every 3 s), `clipboard.rs` (sequence number, 2 Hz), `brightness.rs` (2 Hz, owns the non-Send WMI connection), `visualizer.rs` (only while an equalizer is visible). Together they idle well under 1% CPU.

### Docked vs Floating
`window.rs` decides after each drag whether the island is docked (dropped within `ATTACH_DISTANCE` of the top edge; it snaps to center within `CENTER_SNAP`) or floating, and emits `island-attached`. A drag settles as soon as the mouse button is released. The frontend flips to the floating pill the moment a drag starts and calls `island_drag_started` so a drag that never moves still settles.

### Glass
A web view in a transparent window cannot blur what is behind the window. `backdrop.rs` owns a bare native window directly beneath the island hosting a `Windows.UI.Composition` sprite painted with the host backdrop brush (DWM's blurred view of what is behind), clipped by a rounded-rectangle geometry. `FloatShell` sends the island's in-flight shape on every animation frame (`onUpdate` -> `set_backdrop`), and the window follows moves and visibility natively. The web view draws tint, edge highlights and gloss (`.float-shell.glass`). The clip is circular, so squircle shapes send a tighter radius (`SQUIRCLE_CLIP_FACTOR`); a square docked top is made by extending the clip above the visual.

Glass applies when the Visual Style is Glass, or Auto while floating; otherwise the backdrop is hidden (`set_backdrop(null)`).

### Live Activities
`useActivities` merges ongoing activities (media) with transient ones (notifications) pushed through `show(activity, lifetimeMs, onExpire)`, sorted by `ActivityPriority`. The first activity owns the pill; the second is rendered as a `SplitBubble` beside it in compact modes. New activity kinds (timers, HUDs, battery…) are added to `activities/types.ts` and given a pill and bubble rendering.

---

## 4. Rust Backend Architecture

### Media Pipeline (`src-tauri/src/media.rs`)
FLOAT communicates with Windows Global System Media Transport Controls (GSMTC):
```
Windows GSMTC (Spotify / YouTube / Media Players)
       │
       ▼
win-gsmtc / WinRT Background Task (Rust)
       │
       ├─► Broadcasts session state ("multi-session-changed"; album art excluded, see artKey)
       └─► Streams position ticks ("session-position-changed")
       │
       ▼
Frontend Platform Layer (`src/platform/media.ts`)
       │
       ▼
`mediaTimeline.ts` (Sub-frame interpolation) ──► `FloatPill` / `FloatSurface`
```

### Notification Pipeline (`src-tauri/src/notifications.rs`)
FLOAT connects directly to the Windows `UserNotificationListener`:
```
Windows Toast Notification (WhatsApp, Discord, Outlook, System)
       │
       ▼
Windows UserNotificationListener (WinRT)
       │
       ▼ (Event: NotificationChanged)
Rust Notification Bridge (`src-tauri/src/notifications.rs`)
       │
       ▼ (Tauri Event: "notification-presence")
`FloatShell.tsx`
       │
       ├─► Temporary Preview Banner (3.5s dwell timeout)
       │         │
       │         ▼ (Timeout expires)
       │   Restore exact previous state (Media / Pill / Orb)
       │
       └─► Persistent Notification Collection (`NotificationItem[]`)
                 │
                 ▼
           `FloatNotificationsView.tsx` (Scrollable deck with dismissal)
```

---

## 5. Building & Packaging

### Development Mode
```powershell
# Install frontend dependencies
npm install

# Run Vite dev server + Tauri window
npm run tauri dev
```

### Production MSIX Packaging
Windows `UserNotificationListener` requires Windows AppModel package identity to receive toast notifications. Unpackaged `.exe` builds cannot access notification metadata.

FLOAT uses `scripts/package-msix.ps1` for automated compilation, packaging, and signing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-msix.ps1
```

### Dynamic Windows SDK Tool Discovery
The packaging script dynamically locates required SDK tools (`makeappx.exe`, `makepri.exe`, `signtool.exe`) across standard Windows Kits directories (`C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64`), automatically selecting the newest installed SDK version on any development machine.

### Production Custom Protocol
In production, FLOAT runs with the `custom-protocol` feature enabled in `Cargo.toml`. Frontend assets are bundled and served directly via Tauri's internal protocol (`tauri.localhost`), ensuring high performance and zero network latency.

---

## 6. IPC Command Reference

### Media Commands
- `get_multi_session_state()`: Returns all active GSMTC media sessions.
- `select_media_session(session_id: String)`: Sets the primary active media session.
- `media_play_pause(session_id: Option<String>)`: Toggles playback.
- `media_next(session_id: Option<String>)`: Skips to next track.
- `media_prev(session_id: Option<String>)`: Skips to previous track.
- `media_seek(position: f64, session_id: Option<String>)`: Scrubs to a timeline position in seconds.
- `get_album_art(session_id: String)`: Returns the session's album art as base64. Sessions carry an `artKey` content hash; fetch only when it changes.

Controls resolve the target session by `SourceAppUserModelId` (win-gsmtc session ids are counters, not indices), using the track title to break ties between sessions from the same app.

### Notification Commands
- `get_active_notifications()`: Returns all currently active notifications in Windows Action Center.
- `remove_notification(id: u32)`: Dismisses a specific notification from Windows Action Center.
- `clear_all_notifications()`: Clears all notifications from Windows Action Center.

### Window Commands
- `set_hit_regions(regions: Vec<HitRect>)`: Logical-px rectangles (relative to the window) that should catch the mouse.
- `set_hide_in_fullscreen(enabled: bool)`: Mirrors the Hide in Fullscreen setting.
- `reset_window_position()`: Moves the island back to top-center and saves it.
- Native window dragging uses Tauri's `startDragging()` from the frontend.

### System Commands
- `get_focus_presence()`: Current Focus Assist status (`normal` / `active` / `unknown`).
- `get_autostart()` / `set_autostart(enabled: bool)`: Launch at startup; `set_autostart` returns the resulting state.
- `get_hotkey()`: The global hotkey that was registered, or `null`.
- `get_app_icon(app_id: String)`: The app's icon as base64 PNG, or `null`. Rendered through `shell:AppsFolder`, so it works for Win32 and packaged apps.
- `get_volume()`, `change_volume(delta: f32)`, `toggle_mute()`: System output volume (`{ level, muted }`).
- `set_visualizer_active(active: bool)`: Starts/stops loopback capture. The frontend ref-counts mounted equalizers (`AudioBars`).
- `set_volume(level: f32)`: Absolute volume (0..1).
- `set_backdrop(shape | null)`: The glass backdrop's shape in logical px relative to the window.
- `get_island_attached()`, `island_drag_started()`: Docked state and drag start.
- `wifi_networks(rescan: bool)`, `wifi_connect(ssid, password?)`: Nearby networks and joining one; rejects with `"password-required"` when a password is needed.
- `bluetooth_devices()`: Paired devices with their connected state.
- `get_system_stats()`: `{ cpu, memoryUsed, memoryTotal, down, up }` since the previous call.
- `get_weather(city, fahrenheit)`, `get_calendar_events(url)`: Opt-in network widgets; call only when configured.
- `get_power_state()`: `{ percent, charging, low }`, or `null` without a battery.
- `get_privacy_state()`: `{ microphone, camera }` app names currently using them.
- `get_brightness()` / `set_brightness(level: u8)`: Built-in panel brightness (0-100), `null` if unsupported.
- `get_connectivity()`, `set_radio(kind: "wifi" | "bluetooth", on: bool)`: Radio state and toggles.
- `open_settings_page(page)`: Opens an allowlisted `ms-settings:` page.
- `get_shelf()`, `add_to_shelf(paths)`, `remove_from_shelf(path)`, `clear_shelf()`, `open_shelf_item(path, reveal)`, `get_shelf_thumbnail(path)`, `shelf_drag_icon(path)`: File shelf. Only paths already on the shelf can be opened or rendered; dragging out uses `tauri-plugin-drag`.
- `get_clipboard_history()`, `copy_clipboard_entry(id)`, `remove_clipboard_entry(id)`, `clear_clipboard_history()`, `set_clipboard_history_enabled(enabled)`: Clipboard history.
- `get_lyrics(title, artist, album?, duration?)`: Synced lyric lines from LRCLIB, cached per track. Call only when the user has enabled Synced Lyrics.

### Events (Rust → Frontend)
- `multi-session-changed`, `session-position-changed`: Media state.
- `notification-presence`: Notification added / removed / seeded.
- `focus-presence`: Focus Assist status changed (polled every ~500 ms).
- `island-hover`: `{ inside: bool }` when the cursor enters or leaves the hit regions.
- `island-command`: `"open"` or `"toggle"`, from the tray, hotkey or a second launch.
- `autostart-changed`: Launch-at-startup state changed (e.g. from the tray).
- `audio-levels`: `{ levels: [low, mid, high], silent }` at ~30 Hz while the visualizer is active.
- `volume-changed`, `brightness-changed`: Level changes from any source (keys, other apps).
- `power-changed`: Plug/unplug, or crossing 20% / 10% on battery.
- `privacy-changed`: Camera / microphone use started or stopped.
- `connectivity-changed`, `bluetooth-device`: Radio / network / device changes.
- `clipboard-changed`: The clipboard history list after a new copy.
- `island-attached`: `bool`, after a drag ends or the position is reset.

### Notification Delivery
`NotificationChanged` requires package identity. When registering it fails (unpackaged and dev builds), `notifications.rs` diffs the active toast list every 1.5 s and emits the same events, so notifications work in `npm run tauri dev` too.
