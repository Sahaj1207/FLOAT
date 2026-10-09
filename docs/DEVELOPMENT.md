# FLOAT v1.0.1 Developer Guide & Architecture Reference

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
│   ├── activities/         # Live-activity model and priority stack
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
│   │   ├── focus.rs        # Focus Assist status command
│   │   ├── lib.rs          # Plugin, command and module wiring
│   │   ├── main.rs         # Application binary entry point
│   │   ├── media.rs        # Windows GSMTC media session monitoring
│   │   ├── notifications.rs# Windows UserNotificationListener events (with polling fallback)
│   │   ├── tray.rs         # Tray icon, global hotkey, island commands
│   │   ├── visualizer.rs   # WASAPI loopback capture -> 3-band audio levels
│   │   ├── volume.rs       # System volume via Core Audio
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

### Events (Rust → Frontend)
- `multi-session-changed`, `session-position-changed`: Media state.
- `notification-presence`: Notification added / removed / seeded.
- `focus-presence`: Focus Assist status changed (polled every ~500 ms).
- `island-hover`: `{ inside: bool }` when the cursor enters or leaves the hit regions.
- `island-command`: `"open"` or `"toggle"`, from the tray, hotkey or a second launch.
- `autostart-changed`: Launch-at-startup state changed (e.g. from the tray).
- `audio-levels`: `{ levels: [low, mid, high], silent }` at ~30 Hz while the visualizer is active.

### Notification Delivery
`NotificationChanged` requires package identity. When registering it fails (unpackaged and dev builds), `notifications.rs` diffs the active toast list every 1.5 s and emits the same events, so notifications work in `npm run tauri dev` too.
