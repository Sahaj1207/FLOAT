# FLOAT

A Dynamic Island for Windows.

FLOAT is a lightweight MacBook-style notch for Windows. It hangs from the top of your screen and brings media controls, a live audio visualizer, Windows notifications, a volume HUD and quick settings into one place.

## FLOAT v2.0.0

A ground-up redesign: a MacBook-style notch with real liquid glass, a calm focused panel, and a set of everyday tools. See [CHANGELOG.md](CHANGELOG.md) for everything that changed.

---

## ✨ Features

- **MacBook-Style Notch**: Solid black, flush with the top edge, with concave corners that join it to the bezel. It grows downward to fit whatever is live: a quiet notch when idle, a slim strip for music, a taller drop-down for notifications.
- **Optional Orb Mode**: Prefer a floating circle? Set Idle Behavior to Orb and the island shrinks to a 48×48 orb after ~3 seconds untouched.
- **Interactive Awakening**: Hovering over or interacting with the Orb smoothly restores the active compact pill.
- **Spotify & Windows GSMTC Media Integration**: Universal support for Spotify, Apple Music, YouTube, and browser playback via Windows Global System Media Transport Controls.
- **Live Audio Visualizer**: The equalizer bars follow the actual sound playing (WASAPI loopback, low/mid/high bands), falling back to a gentle animation when output is muted.
- **Album-Art Accent**: The equalizer, progress bar and a soft glow under the notch take on the dominant color of the current album art.
- **Continuous Title Marquee**: Long track titles smoothly scroll in a continuous loop without clipping.
- **Album Artwork**: Embedded album art displayed with fluid cross-fades.
- **Playback Controls**: Instant play/pause, next track, previous track, and interactive timeline scrubbing.
- **Universal Windows Notifications**: Directly integrates with Windows `UserNotificationListener` to detect system and app toast notifications (WhatsApp, Discord, Slack, Outlook, Notepad, etc.).
- **3.5-Second Notification Preview**: Incoming notifications trigger an automatic ~3.5-second island banner expansion.
- **State Restoration**: After 3.5 seconds, FLOAT automatically returns to the exact state it was in before the notification arrived (Spotify player, compact pill, or ambient orb).
- **Persistent Notification Center**: Notifications survive the temporary preview and remain stored in a dedicated Notification Section until dismissed.
- **Notification Count Badge**: Real-time unread count badge in the surface navigation bar.
- **Scrollable Notification List**: Scroll container with fixed headers and custom slim glass scrollbars.
- **Individual Dismissal & Clear All**: Dismiss single notifications with one click or clear the entire history at once.
- **Live Activities & Split Island**: When two things are live at once (for example a notification arrives while music plays), the top one owns the pill and the other detaches into a bubble beside it, Dynamic Island style.
- **Click-Through Window**: Only the island itself catches the mouse; the space around it passes clicks to the apps underneath, and morphs never resize the native window.
- **Hide in Fullscreen**: The island gets out of the way of fullscreen games, videos and presentations.
- **Real Liquid Glass**: A native compositor backdrop blurs whatever is actually behind the island, shaped to it and updated every frame, with lit edges and gloss drawn on top. No screen capture, so it costs no CPU and FLOAT still appears in screenshots.
- **Notch or Floating Pill**: Docked at the top edge it is the black notch. Drag it off and it becomes a floating glass pill you can park anywhere; drop it back near the top to dock it again.
- **Visual Styles**: Auto (black notch docked, glass when floating), Glass everywhere, or Black everywhere, with an adjustable glass tint.
- **Apple-Style Shapes**: The island is drawn as one vector outline with true continuous corners (not rounded rectangles), including the notch's ears, and content blurs and scales as it changes.
- **One Design System**: A single type scale (Inter), icon family, spacing grid and control set across every view, with color reserved for meaning.
- **Hover to Open**: Rest the pointer on the notch and the panel opens; move away and it closes (click-to-open is one setting away).
- **Real App Icons**: Notifications show the sending app's icon.
- **Gestures**: Scroll over the island to change volume (with an on-island volume HUD), scroll sideways to skip tracks, swipe a notification up to dismiss it.
- **Spring Physics**: Morphs follow your Animation Intensity, from calm to bouncy, and the island squishes when pressed.
- **Focused Home**: Open the notch and you get just the player (or a large clock when nothing plays) and one calm line: the time, weather, and your next calendar event or task. Everything else is one tab away.
- **Tasks**: A simple to-do list. Type, press Enter, tick it off. Stored only on this PC; the next open task shows on Home.
- **Timer & Stopwatch**: Type any duration into the big readout or tap a preset; it counts down live in the notch and chimes when done.
- **File Shelf**: Drag files onto the notch to park them, then drag them out into any app later.
- **Clipboard History**: Recent copied text and images, one click to copy again. In memory only; content apps mark as private (passwords) is never kept.
- **Control Center**: Wi-Fi and Bluetooth toggles, a list of nearby Wi-Fi networks to join (with an inline password prompt), paired Bluetooth devices, volume and brightness sliders, battery and Focus status.
- **System Live Activities**: Volume and brightness HUDs for the hardware keys, charging and low-battery alerts, Bluetooth devices connecting, Focus turning on or off, and Mac-style green/orange dots while the camera or microphone is in use.
- **Synced Lyrics (opt-in)**: The current lyric line under the playing track, from LRCLIB.
- **Persistent User Preferences**: Local persistence for transparency, pill length, orb size, idle behavior, and privacy toggles.
- **Tray Icon & Global Hotkey**: Open the island from the tray or with `Ctrl+Alt+Space` (falls back to `Alt+Shift+Space` or `Ctrl+Alt+I` if another app owns it).
- **Launch at Startup**: Optional, from Settings or the tray menu.
- **Remembered Position**: FLOAT remembers where you left it, docked or floating.
- **Multi-Monitor & DPI Aware**: Crisp rendering across standard and high-DPI Windows display scaling.
- **Packaged AppModel Identity**: MSIX package architecture with native Windows restricted capabilities.

---

## 🔄 How FLOAT Works

```text
[ Normal Flow ]
Compact Pill ────────( ~3s untouched )───────► Ambient Orb (48×48)
     ▲                                                │
     └──────────────( hover / double-tap )────────────┘

[ Notification Flow ]
Active State (Media / Pill / Orb)
     │
     ▼ (Windows toast arrives)
Temporary Preview Banner (~3.5s)
     │   (media keeps playing in a split bubble beside the pill)
     │
     ▼ (3.5s dwell expires)
Exact Previous State Restored (Media / Pill / Orb)
     └─► Notification remains saved in Notification Section

[ Media Flow ]
Media Stream Detected ──► Media Pill (Album Art + Marquee Title + Equalizer)

[ Expanded Surface Flow ]
Pill / Orb ──( Click )──► Expanded Surface [ Media | Notifications | Settings ]
```

---

## 🖼️ Screenshots

### The notch

![The notch while music plays](assets/screenshots/notch-media.png)

![A notification, with music moved to the side](assets/screenshots/notch-notification.png)

### Home

![Home: the player and one calm line](assets/screenshots/panel-home.png)

### Tasks and Timer

![Tasks](assets/screenshots/panel-tasks.png)

![Timer](assets/screenshots/panel-timer.png)

### Floating glass

![Dragged off the edge, FLOAT becomes a glass pill](assets/screenshots/glass-pill.png)

![The panel in glass](assets/screenshots/glass-panel.png)

---

## 🎮 Controls & Gestures

| Gesture / Action | Target | Result |
| :--- | :--- | :--- |
| **Single Click** | Compact Pill | Opens Expanded Surface |
| **Single Click** | Orb | Opens Quick Actions or Notification Preview |
| **Double Click** | Compact Pill | Morphs to Orb |
| **Scroll** | Island | Changes system volume and shows the volume HUD |
| **Scroll sideways / Shift+Scroll** | Island | Previous / next track |
| **Swipe up** | Notification | Dismisses it |
| **Double Click** | Orb | Morphs to Compact Pill |
| **Hover (200ms dwell)** | Compact Pill | Expands to Compact Preview |
| **Hover** | Orb | Wakes up and morphs to Compact Pill |
| **Pointer Leave** | Compact Preview | Returns to Compact Pill (160ms delay) |
| **Click** | Split Bubble | Opens Expanded Surface |
| **Click outside** | Expanded Surface | Collapses back to resting mode |
| **Drag** | Island | Repositions FLOAT; drops near top-center snap back to it |
| **Escape Key** | Expanded Surface / Preview | Closes surface / preview and returns to resting mode |
| **`Ctrl+Alt+Space`** | Anywhere | Toggles the Expanded Surface (see Settings for the active hotkey) |
| **Left-click** | Tray icon | Opens the Expanded Surface |

---

## 🚀 Installation

### For Users

Download from the [Releases](https://github.com/Sahaj1207/FLOAT/releases/latest) page:

- **Setup program (recommended)**: run `FLOAT_2.0.0_x64-setup.exe`. If Windows SmartScreen appears, choose **More info**, then **Run anyway**.
- **MSIX package**: `FLOAT.msix` needs FLOAT's certificate trusted once before it will install on a new PC.

Step-by-step instructions for both are in [docs/INSTALL.md](docs/INSTALL.md).

### For Developers

Clone the repository and build from source:

```bash
git clone https://github.com/Sahaj1207/FLOAT.git
cd FLOAT
```

---

## ⚡ Quick Start

### Prerequisites

- **Windows**: Windows 10 (Build 17763 / Version 1809+) or Windows 11
- **Node.js**: v18.0 or higher (v20+ recommended)
- **Rust**: 1.75.0 or higher (`cargo`, `rustc`)
- **Tauri Prerequisites**: C++ Build Tools for Visual Studio 2022
- **WebView2 Runtime**: Pre-installed on Windows 11 and modern Windows 10

### Development Mode

```powershell
# Install dependencies
npm install

# Start Vite dev server + Tauri desktop window
npm run tauri dev
```

### MSIX Release Packaging

To compile the production bundle, build the Rust binary with custom protocol, generate the AppxManifest, pack the MSIX, sign it with a developer certificate, and install it locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-msix.ps1
```

---

## 🔐 Privacy

- **Local Processing**: All media and notification data is processed locally on your machine using standard Windows WinRT and GSMTC APIs.
- **No Cloud Account**: FLOAT does not require external user accounts, cloud servers, or API keys for its core functionality.
- **Privacy Mode**: You can disable notification content previews in the Settings tab to hide message titles and bodies while retaining presence dots.
- **Network Use**: Only three opt-in features talk to the internet, and all are off until you set them up: **Synced Lyrics** sends the playing track's title, artist, album and length to [lrclib.net](https://lrclib.net); **Weather** sends the city name you type to [open-meteo.com](https://open-meteo.com); **Calendar** downloads the private ICS link you paste.
- **Wi-Fi passwords** you type to join a network go straight to Windows, which stores the profile; FLOAT keeps nothing.
- **Clipboard History** stays in memory and is never written to disk. Content that apps flag as private (password managers) is skipped, and turning the feature off clears it.
- **File Shelf** stores only file paths, in your app data folder; files are never copied or uploaded.

---

## 🛠️ Tech Stack

- **Desktop Framework**: [Tauri 2.0](https://tauri.app/)
- **Backend**: [Rust](https://www.rust-lang.org/) (WinRT, `windows-rs`, `win-gsmtc`, `tokio`, `serde`)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Animation Engine**: [Framer Motion](https://www.framer.com/motion/)
- **Webview**: Microsoft Edge WebView2
- **Packaging**: Windows MSIX / AppModel Identity

---

## 📂 Project Structure

```text
FLOAT/
├── .vscode/                # Recommended workspace extensions
├── assets/
│   └── screenshots/        # Official FLOAT screenshots
│       ├── float-media.png
│       ├── float-notification.png
│       ├── float-notifications.png
│       ├── float-orb.png
│       ├── float-pill.png
│       └── float-settings.png
├── docs/                   # Full documentation
│   ├── USER_GUIDE.md       # Complete end-user manual
│   └── DEVELOPMENT.md      # Architecture, IPC, and packaging guide
├── scripts/                # Build and packaging automation
│   └── package-msix.ps1    # Automated MSIX packager with dynamic SDK discovery
├── src/                    # React 19 Frontend
│   ├── components/float/   # FloatPill, FloatOrb, FloatSurface, Notifications, Settings
│   ├── platform/           # Tauri IPC bindings (media, notifications, focus)
│   ├── services/           # Settings persistence and theme application
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── src-tauri/              # Rust Backend
│   ├── icons/              # Application icons for Windows AppX
│   ├── src/
│   │   ├── focus.rs        # Windows Focus Assist / Quiet Hours detection
│   │   ├── lib.rs          # Window sync, commands, and event registration
│   │   ├── main.rs         # Application entry point
│   │   ├── media.rs        # Windows GSMTC media session monitoring & controls
│   │   └── notifications.rs # Windows UserNotificationListener event listener
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .gitignore
├── CONTRIBUTING.md         # Guidelines for contributors
├── LICENSE                 # MIT License
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 📦 Project Status

**FLOAT v2.0.0** is the latest release. It replaces the 1.x pill and orb with the notch design and adds the panel tools (Tray, Tasks, Timer, Controls). Install the MSIX for the full experience: launch at startup, instant notifications and Wi-Fi/Bluetooth toggles need the packaged app.

Glass needs Windows 11; on Windows 10 the island falls back to a solid tint.

---

## 📄 License

Distributed under the [MIT License](LICENSE).