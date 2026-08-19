# FLOAT v1.0 Developer Guide & Architecture Reference

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
│   ├── services/           # Settings persistence and CSS custom properties
│   │   └── settings.ts     # localStorage settings store & listeners
│   ├── App.tsx             # Root component
│   ├── index.css           # Global glass design tokens and utility styles
│   └── main.tsx            # Application entry point
├── src-tauri/               # Rust Backend (Tauri 2.0)
│   ├── icons/              # Application and AppX visual assets
│   ├── src/
│   │   ├── focus.rs        # Windows Focus Assist / Quiet Hours detection
│   │   ├── lib.rs          # Tauri command handlers & window sync logic
│   │   ├── main.rs         # Application binary entry point
│   │   ├── media.rs        # Windows GSMTC media session monitoring
│   │   └── notifications.rs# Windows UserNotificationListener event listener
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
       ├─► Broadcasts full session state ("media-state-changed")
       └─► Streams position ticks ("media-position-changed")
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
npm run dev
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
- `media_seek_to(position_ms: u64, session_id: Option<String>)`: Scrubs to timeline position.

### Notification Commands
- `get_active_notifications()`: Returns all currently active notifications in Windows Action Center.
- `remove_notification(id: u32)`: Dismisses a specific notification from Windows Action Center.
- `clear_all_notifications()`: Clears all notifications from Windows Action Center.

### Window Commands
- `sync_window_size(width: f64, height: f64)`: Adjusts the native window dimensions to match island bounds.
- `start_window_drag()`: Initiates native OS window dragging.
- `hide_window()`: Minimizes/hides the FLOAT window.
