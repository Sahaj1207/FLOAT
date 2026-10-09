# FLOAT v1.0.1 User Guide

Welcome to the comprehensive user guide for **FLOAT**, a Dynamic Island desktop experience for Windows 10 and 11.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Requirements](#2-system-requirements)
3. [Installation](#3-installation)
4. [First Launch & Desktop Placement](#4-first-launch--desktop-placement)
5. [Compact Pill Mode](#5-compact-pill-mode)
6. [Automatic Inactivity Transition (Pill → Orb)](#6-automatic-inactivity-transition-pill--orb)
7. [Ambient Orb Mode](#7-ambient-orb-mode)
8. [Waking / Returning from Orb](#8-waking--returning-from-orb)
9. [Media & Spotify Integration](#9-media--spotify-integration)
10. [Media Controls & Timeline Scrubbing](#10-media-controls--timeline-scrubbing)
11. [Windows Notifications Integration](#11-windows-notifications-integration)
12. [3.5-Second Notification Preview Flow](#12-35-second-notification-preview-flow)
13. [Coexistence: Media + Notifications](#13-coexistence-media--notifications)
14. [Persistent Notification Center](#14-persistent-notification-center)
15. [Notification List Scrolling](#15-notification-list-scrolling)
16. [Individual Dismissal & Clear All](#16-individual-dismissal--clear-all)
17. [Expanded Surface Overview](#17-expanded-surface-overview)
18. [Navigation Tabs (Media, Notifications, Settings)](#18-navigation-tabs)
19. [Personalization & Settings](#19-personalization--settings)
20. [Gestures & Shortcut Controls](#20-gestures--shortcut-controls)
21. [Window Management & Always-on-Top](#21-window-management--always-on-top)
22. [Multi-Monitor & DPI Scaling](#22-multi-monitor--dpi-scaling)
23. [Troubleshooting & FAQ](#23-troubleshooting--faq)
24. [Windows Permissions & Capabilities](#24-windows-permissions--capabilities)
25. [Resetting Settings & Data](#25-resetting-settings--data)
26. [Uninstalling FLOAT](#26-uninstalling-float)

---

## 1. Introduction

FLOAT is an ambient desktop overlay that unifies media playback, real-time Windows notifications, and quick system controls into a floating glass island anchored at the top of your desktop.

---

## 2. System Requirements

- **Operating System**: Windows 10 (Build 17763 / Version 1809 or higher) or Windows 11.
- **Architecture**: 64-bit (x64).
- **Runtime**: Microsoft Edge WebView2 Runtime (included by default on modern Windows).
- **Identity**: Packaged AppModel identity (MSIX) for Windows UserNotificationListener access.

---

## 3. Installation

1. Download the latest `FLOAT.msix` release installer.
2. Double-click the `.msix` file to open Windows App Installer.
3. Click **Install**.
4. FLOAT will register in the Windows Start Menu and launch automatically.

---

## 4. First Launch & Desktop Placement

Upon launch:
- FLOAT hangs from the top-center of your primary display like a MacBook notch.
- If Spotify or any media source is playing, the notch widens to show the track.
- If nothing is playing, FLOAT rests as a small, quiet notch. Hover it to see the time and date.

---

## 5. Compact Pill Mode

- **Shape**: Flush with the top of the screen, square top corners, rounded bottom corners, with small concave "ears" where it meets the bezel (Notch style).
- **Size follows content**: 200 × 32 px when idle; the activity width (300 px by default, adjustable 220–340 px) × 36 px for music and the volume HUD; a 62 px drop-down for notifications.
- **Hover Dwell**: Resting the pointer on the notch for 200ms grows it slightly to reveal more (playback progress for music, time and date when idle). Moving away restores it after 160ms.
- **Accent**: While music plays, the equalizer, progress bar and a soft glow beneath the notch take on the album art's color.

---

## 6. Automatic Inactivity Transition (Pill → Orb)

By default (Idle Behavior **Island**) FLOAT stays as the notch. If you set Idle Behavior to **Orb** (or **Remember** after double-clicking into the orb):
- When the notch is untouched for **approximately 3 seconds**, it morphs into the **48 × 48 px Orb**, floating just below the top edge.
- Any interaction (hover, click, drag) or a live notification/HUD resets the 3-second timer.

---

## 7. Ambient Orb Mode

- **Dimensions**: 48 × 48 px circular glass sphere (customizable between 44 px and 56 px).
- **Status Indicators**:
  - **Equalizer Bars**: Live 3-bar visualizer when media is playing.
  - **Paused Indicator**: Subtle central dot when media is paused.
  - **Notification Dot**: Glowing blue dot on the upper-right corner when unread notifications exist.
  - **Focus Dot**: Indicator when Windows Focus Assist / Quiet Hours is active.

---

## 8. Waking / Returning from Orb

- **Hover**: Move your mouse pointer over the Orb to smoothly expand it back to the Compact Pill.
- **Single Click**: Opens floating Quick Actions (playback controls) or Notification Preview.
- **Double Click**: Manually toggles between Orb and Compact Pill mode.

---

## 9. Media & Spotify Integration

FLOAT communicates with the Windows Global System Media Transport Controls (GSMTC) service:
- **Supported Players**: Spotify, Apple Music, Tidal, YouTube (Chrome, Edge, Firefox), VLC, Windows Media Player.
- **Metadata**: Live extraction of track title, artist name, and embedded album art.
- **Marquee**: Long song titles scroll in a continuous loop without being cut off.
- **Equalizer**: Dynamic audio equalizer reflecting real-time playback state.

---

## 10. Media Controls, Gestures & Timeline Scrubbing

- **Scroll** over the island to change the system volume (2% per wheel notch). A volume HUD appears in the notch; click its speaker icon to mute.
- **Scroll sideways** (or hold **Shift** and scroll) to skip to the previous or next track.
- The equalizer follows the actual audio playing. When output is muted it falls back to a gentle animation.


- **Compact Pill**: Click Play/Pause on hover preview.
- **Orb Quick Actions**: Single-click the Orb to reveal Previous Track, Play/Pause, and Next Track buttons.
- **Expanded Surface**: Features a full interactive playback progress bar. Click or drag along the timeline to scrub to any point in the track.

---

## 11. Windows Notifications Integration

FLOAT connects to the Windows `UserNotificationListener` API:
- Intercepts incoming notifications across all Windows applications (WhatsApp, Discord, Slack, Outlook, Teams, Mail, Notepad, System Alerts).
- Operates automatically in the background with zero configuration.

---

## 12. 3.5-Second Notification Preview Flow

When a new Windows notification arrives:
1. **Automatic Expansion**: FLOAT immediately expands into a notification preview banner (240 × 56 px).
2. **Card Information**: Displays the app name (with glowing accent dot), bold title, and body preview.
3. **Exact 3.5-Second Dwell**: The preview remains visible on screen for **3.5 seconds**.
4. **Smooth Restoration**: After 3.5 seconds, FLOAT automatically returns to the exact state it was in before the notification arrived:
   - If Spotify was playing in Pill mode → returns to the media player.
   - If FLOAT was in Orb mode → returns to the Orb (with notification presence dot).
5. **Data Preservation**: The notification is preserved in the persistent Notification Section.

---

## 13. Coexistence: Media + Notifications

- If Spotify is playing when a notification arrives, the notification takes over the pill for 3.5 seconds and the music detaches into a small **split bubble** beside it, showing the album art and a live equalizer.
- Click the bubble to open the media player.
- Spotify audio continues playing without interruption.
- When the 3.5-second preview finishes, the bubble merges back and the island returns to the media player.

---

## 14. Persistent Notification Center

To view stored notifications at any time:
1. Click the Compact Pill to open the **Expanded Surface**.
2. Click the **Notifications (Bell)** tab in the top navigation bar.
3. The total unread count is displayed in a blue badge (e.g., `3`).

---

## 15. Notification List Scrolling

- **Scrollable Deck**: The notification list scrolls smoothly via mouse-wheel or precision touchpad.
- **Fixed Header**: The top navigation bar, `"Notifications"` heading, badge count, and `"Clear All"` button remain anchored at the top.
- **Integrated Scrollbar**: A slim 4px translucent scrollbar appears on the right edge during scrolling.
- **Drag Isolation**: Scrolling does not trigger native window movement (`data-no-drag`).

---

## 16. Individual Dismissal & Clear All

- **Individual Dismissal**: Click the circular `✕` button on any notification card to dismiss it. The card animates out and the badge count updates immediately.
- **Clear All**: Click **Clear All** in the top-right corner to dismiss all notifications simultaneously and transition to the empty state (*"No new notifications"*).

---

## 17. Expanded Surface Overview

- **Dimensions**: 460 × 330 px with 28 px corner radius.
- **How to Open**: Click anywhere on the resting Compact Pill.
- **How to Close**:
  - Click the collapse chevron (`⌃`) in the top navigation bar.
  - Press the `Escape` key.
  - Click outside the island.

---

## 18. Navigation Tabs

The Expanded Surface includes three sections:
1. **Media Tab (Music Note icon)**: Album artwork, track title, artist, interactive progress scrubber, playback controls, and multi-session switcher.
2. **Notifications Tab (Bell icon + Count Badge)**: Scrollable notification history deck with individual dismissal and Clear All.
3. **Settings Tab (Gear icon)**: Full personalization and visual customization deck.

---

## 19. Personalization & Settings

All settings are stored in `localStorage` (`float_settings_v1`) and take effect immediately:

| Setting | Range / Options | Default | Description |
| :--- | :--- | :--- | :--- |
| **Glass Transparency** | 60% – 100% | `100%` | Background opacity (the Notch style is solid at 100%). |
| **Activity Width** | 220 px – 340 px | `300 px` | Width of the notch while music, the volume HUD or a hover preview is shown. |
| **Orb Size** | 44 px – 56 px | `48 px` | Sets diameter of the ambient circular orb. |
| **Idle Behavior** | `Island`, `Remember`, `Orb` | `Island` | Island stays as the notch; Orb shrinks to a circle after ~3s idle; Remember uses whichever you last double-clicked into. |
| **Animation Intensity** | `Subtle`, `Balanced`, `Expressive` | `Balanced` | Spring feel of every morph: Subtle never overshoots, Balanced has a slight bounce, Expressive is playful. Also scales the press squish. |
| **Visual Style** | `Notch`, `Glass`, `Minimal`, `Soft Glass` | `Notch` | Notch is solid black like the MacBook notch; the others are translucent glass. |
| **Notification Presence** | `On` / `Off` | `On` | Toggles the glowing notification dot on the Orb. |
| **Notification Preview** | `On` / `Off` | `On` | Toggles automatic 3.5s toast banner expansion. |
| **Notification Content** | `On` / `Off` | `On` | When `Off`, hides notification title/body for privacy. |
| **Hide in Fullscreen** | `On` / `Off` | `On` | Hides the island while a fullscreen game, video or presentation is focused. |
| **Launch at Startup** | `On` / `Off` | `Off` | Starts FLOAT when you sign in. Stored by Windows, not in `localStorage`. |

---

## 20. Gestures & Shortcut Controls

- **Single Click**: Expands Pill to Surface; opens Orb Quick Actions / Preview.
- **Double Click**: Toggles between Compact Pill and Orb.
- **Hover**: Expands Compact Pill to Compact Preview; wakes Orb to Compact Pill.
- **Scroll**: Changes system volume (shows the volume HUD).
- **Scroll sideways / Shift+Scroll**: Previous / next track.
- **Swipe up on a notification**: Dismisses it.
- **Window Drag**: Drag the island to reposition it anywhere on screen. The position is remembered; dropping it within a short distance of top-center snaps it exactly back.
- **Escape Key**: Closes the Expanded Surface or transient previews.
- **Click Outside**: Collapses the Expanded Surface.
- **Global Hotkey**: `Ctrl+Alt+Space` toggles the Expanded Surface from anywhere. If another app already owns it, FLOAT uses `Alt+Shift+Space` or `Ctrl+Alt+I` instead; Settings → System shows which one is active.
- **Tray Icon**: Left-click to open the island. Right-click for Show Island, Reset Position, Launch at Startup and Quit.

---

## 21. Window Management & Always-on-Top

- **Always on Top**: FLOAT floats above standard application windows and borderless games.
- **Transparent Hitbox**: Only the island (and split bubble) catch the mouse. Everything around them passes clicks through to the apps underneath.
- **Fullscreen**: With **Hide in Fullscreen** on, the island hides while a fullscreen app is focused and returns afterwards.
- **Hide / Show**: Use the tray menu's **Show Island** item to hide FLOAT without quitting.
- **No Taskbar Clutter**: Runs with `skipTaskbar: true` to avoid cluttering your taskbar.

---

## 22. Multi-Monitor & DPI Scaling

- **DPI Awareness**: FLOAT uses Per-Monitor V2 DPI awareness. Glass borders, typography, and album artwork remain sharp across 100%, 125%, 150%, 175%, and 200% Windows display scaling.
- **Positioning**: Starts at the top-center of your display, or wherever you last dragged it if that monitor is still connected. Use **Reset Position** in the tray menu to return to top-center.

---

## 23. Troubleshooting & FAQ

### Notifications are not appearing in FLOAT
1. Ensure notifications are enabled in **Windows Settings → System → Notifications**.
2. Verify that **Focus Assist / Do Not Disturb** is not actively silencing notifications.
3. Install FLOAT as a packaged application (`FLOAT.msix`) for instant delivery. Unpackaged `.exe` runs cannot subscribe to live notification events, so they check for new notifications every 1.5 seconds instead.

### Media controls are not responding
1. Ensure the media application (Spotify, Chrome, Edge) is registered with Windows GSMTC.
2. In Spotify: Go to **Settings → Display options → Show desktop overlay when using media keys** (enabled).

---

## 24. Windows Permissions & Capabilities

FLOAT requires two standard Windows UWP/AppX capabilities:
- `runFullTrust`: Allows the application to host its high-performance Rust Tauri backend.
- `userNotificationListener`: Allows FLOAT to receive toast notification metadata for Dynamic Island previews.

---

## 25. Resetting Settings & Data

1. Open the Expanded Surface (click the pill).
2. Switch to the **Settings** tab.
3. Scroll to the bottom and click **Reset to Defaults**.

---

## 26. Uninstalling FLOAT

1. Open Windows **Settings → Apps → Installed apps**.
2. Search for **FLOAT**.
3. Click the three dots (`...`) and select **Uninstall**.
