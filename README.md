# FLOAT

A Dynamic Island for Windows.

FLOAT is a lightweight Windows desktop Dynamic Island that brings media controls, Windows notifications, ambient Orb mode, and quick settings into a single glass interface.

## FLOAT v1.0.0

First public release.

---

## ✨ Features

- **Dynamic Pill Interface**: An unobtrusive resting pill at the top-center of your screen that dynamically adapts to system activity.
- **Ambient Orb Mode**: Compact 48×48 circular orb that preserves screen real estate while keeping vital indicators visible.
- **Automatic Inactivity Transition**: Untouched compact pill automatically and smoothly morphs into the Orb after ~3 seconds of inactivity.
- **Interactive Awakening**: Hovering over or interacting with the Orb smoothly restores the active compact pill.
- **Spotify & Windows GSMTC Media Integration**: Universal support for Spotify, Apple Music, YouTube, and browser playback via Windows Global System Media Transport Controls.
- **Live Audio Equalizer**: Animated 3-bar equalizer reflecting real-time playback states.
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
- **Media & Notification Coexistence**: Notifications temporarily overlay media without stopping playback or losing track metadata.
- **Glassmorphism Aesthetic**: Translucent acrylic/mica aesthetic with customizable transparency, border highlights, and blur depth.
- **Framer Motion Spring Physics**: Natural, physical layout animations and morph transitions.
- **Expanded Surface**: 460×330 px interactive panel featuring three dedicated sections: Media, Notifications, and Settings.
- **Persistent User Preferences**: Local persistence for transparency, pill length, orb size, idle behavior, and privacy toggles.
- **Multi-Monitor & DPI Aware**: Crisp rendering across standard and high-DPI Windows display scaling.
- **Packaged AppModel Identity**: MSIX package architecture with native Windows restricted capabilities.

---

## 🔄 How FLOAT Works

```
[ Normal Flow ]
Compact Pill ────────( ~3s untouched )───────► Ambient Orb (48×48)
     ▲                                                │
     └──────────────( hover / double-tap )────────────┘

[ Notification Flow ]
Active State (Media / Pill / Orb)
     │
     ▼ (Windows toast arrives)
Temporary Preview Banner (~3.5s)
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

<!-- TODO: Add official v1.0 screenshot assets before final public release -->

| State | Preview |
| :--- | :--- |
| **Compact Pill (Resting)** | *(Screenshot placeholder: `assets/float-pill.png`)* |
| **Ambient Orb Mode (48×48)** | *(Screenshot placeholder: `assets/float-orb.png`)* |
| **Media Player & Equalizer** | *(Screenshot placeholder: `assets/float-media.png`)* |
| **Notification Preview (~3.5s)** | *(Screenshot placeholder: `assets/float-notification.png`)* |
| **Notification Center (Deck)** | *(Screenshot placeholder: `assets/float-notifications.png`)* |
| **Expanded Surface & Settings** | *(Screenshot placeholder: `assets/float-settings.png`)* |

---

## 🎮 Controls & Gestures

| Gesture / Action | Target | Result |
| :--- | :--- | :--- |
| **Single Click** | Compact Pill | Opens Expanded Surface |
| **Single Click** | Orb | Opens Quick Actions or Notification Preview |
| **Double Click** | Compact Pill | Morphs to Orb |
| **Double Click** | Orb | Morphs to Compact Pill |
| **Hover (200ms dwell)** | Compact Pill | Expands to Compact Preview |
| **Hover** | Orb | Wakes up and morphs to Compact Pill |
| **Pointer Leave** | Compact Preview | Returns to Compact Pill (160ms delay) |
| **Pull Down (>18px)** | Island | Reveals dismiss target (`✕`) to hide FLOAT |
| **Drag (Horizontal/Up)** | Island | Repositions FLOAT window on desktop |
| **Escape Key** | Expanded Surface / Preview | Closes surface / preview and returns to resting mode |

---

## 🚀 Installation

### For Users

- **Microsoft Store**: Microsoft Store distribution is planned for the public release process.
- **Packaged MSIX**: When a release build is available, download `FLOAT.msix` from the [Releases](https://github.com/your-username/FLOAT/releases) page and install via Windows App Installer.

### For Developers

Clone the repository and build from source:

```bash
git clone <repository-url>
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
npm run dev
```

### MSIX Release Packaging

To compile the production bundle, build the Rust binary with custom protocol, generate AppxManifest, pack the MSIX, sign with a developer certificate, and install locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-msix.ps1
```

---

## 🔐 Privacy

- **Local Processing**: All media and notification data is processed locally on your machine using standard Windows WinRT and GSMTC APIs.
- **No Cloud Account**: FLOAT does not require external user accounts, cloud servers, or API keys for its core functionality.
- **Privacy Mode**: You can disable notification content previews in the Settings tab to hide message titles and bodies while retaining presence dots.

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

```
FLOAT/
├── .vscode/                # Recommended workspace extensions
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
├── src-tauri/               # Rust Backend
│   ├── icons/              # Application icons for Windows AppX
│   ├── src/
│   │   ├── focus.rs        # Windows Focus Assist / Quiet Hours detection
│   │   ├── lib.rs          # Window sync, commands, and event registration
│   │   ├── main.rs         # Application entry point
│   │   ├── media.rs        # Windows GSMTC media session monitoring & controls
│   │   └── notifications.rs# Windows UserNotificationListener event listener
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

FLOAT v1.0.0 is the first public release. Future enhancements and bug fixes will be tracked through GitHub Issues and Pull Requests.

---

## 📄 License

Distributed under the [MIT License](LICENSE).
