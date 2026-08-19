# FLOAT v1.0 User Guide

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
- FLOAT anchors itself in the top-center of your primary display.
- If Spotify or any media source is playing, FLOAT immediately wakes in **Media Pill** mode.
- If no media is playing, FLOAT displays the resting **Compact Pill**.

---

## 5. Compact Pill Mode

- **Dimensions**: 240 px width (customizable between 200 px and 280 px), 48 px height, 24 px corner radius.
- **Visuals**: Translucent glass surface, subtle highlight borders, and living indicators.
- **Hover Dwell**: Moving your mouse over the compact pill for 200ms expands it into **Compact Preview** to reveal quick controls. Moving the pointer away restores the compact pill after a 160ms transition delay.

---

## 6. Automatic Inactivity Transition (Pill → Orb)

To minimize screen clutter:
- When FLOAT rests in Compact Pill mode and remains untouched for **approximately 3 seconds**, it smoothly morphs into the **48 × 48 px Orb**.
- The transition uses Framer Motion spring physics (`stiffness: 380, damping: 34`).
- Any user interaction (hover, click, drag) resets the 3-second timer.

---

## 7. Ambient Orb Mode

- **Dimensions**: 48 × 48 px circular glass sphere (customizable between 44 px and 56 px).
- **Status Indicators**:
  - **Equalizer Bars**: Animated 3-bar equalizer when media is playing.
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

## 10. Media Controls & Timeline Scrubbing

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

- If Spotify is playing when a notification arrives, the island temporarily morphs to display the notification banner for 3.5 seconds.
- Spotify audio continues playing without interruption.
- When the 3.5-second preview finishes, the island morphs back to the media player, resuming the live equalizer and track title marquee.

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
| **Glass Transparency** | 60% – 100% | `85%` | Adjusts background acrylic translucency. |
| **Compact Pill Length** | 200 px – 280 px | `240 px` | Sets resting horizontal width of the pill. |
| **Orb Size** | 44 px – 56 px | `48 px` | Sets diameter of the ambient circular orb. |
| **Idle Behavior** | `Remember`, `Always Orb`, `Always Pill` | `Remember` | Controls resting state after inactivity. |
| **Animation Intensity** | `Subtle`, `Balanced`, `Expressive` | `Balanced` | Adjusts Framer Motion spring stiffness and speed. |
| **Visual Style** | `Default`, `Minimal`, `Soft Glass` | `Default` | Configures glass border highlights and blur depth. |
| **Notification Presence** | `On` / `Off` | `On` | Toggles the glowing notification dot on the Orb. |
| **Notification Preview** | `On` / `Off` | `On` | Toggles automatic 3.5s toast banner expansion. |
| **Notification Content** | `On` / `Off` | `On` | When `Off`, hides notification title/body for privacy. |

---

## 20. Gestures & Shortcut Controls

- **Single Click**: Expands Pill to Surface; opens Orb Quick Actions / Preview.
- **Double Click**: Toggles between Compact Pill and Orb.
- **Hover**: Expands Compact Pill to Compact Preview; wakes Orb to Compact Pill.
- **Pull-Down to Dismiss**: Drag the island downwards by >18 px to reveal the `✕` target and dismiss/hide FLOAT.
- **Window Drag**: Drag horizontally or upwards to reposition FLOAT anywhere on screen.
- **Escape Key**: Closes the Expanded Surface or transient previews.

---

## 21. Window Management & Always-on-Top

- **Always on Top**: FLOAT floats above standard application windows and borderless games.
- **Transparent Hitbox**: The transparent bounds around the pill pass mouse clicks through to underlying desktop elements.
- **No Taskbar Clutter**: Runs with `skipTaskbar: true` to avoid cluttering your taskbar.

---

## 22. Multi-Monitor & DPI Scaling

- **DPI Awareness**: FLOAT uses Per-Monitor V2 DPI awareness. Glass borders, typography, and album artwork remain sharp across 100%, 125%, 150%, 175%, and 200% Windows display scaling.
- **Positioning**: Automatically centers at the top of your primary display upon launch.

---

## 23. Troubleshooting & FAQ

### Notifications are not appearing in FLOAT
1. Ensure notifications are enabled in **Windows Settings → System → Notifications**.
2. Verify that **Focus Assist / Do Not Disturb** is not actively silencing notifications.
3. Ensure FLOAT was installed as a packaged application (`FLOAT.msix`). Standalone unpackaged `.exe` runs cannot access the Windows UserNotificationListener API due to Windows AppModel security restrictions.

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
