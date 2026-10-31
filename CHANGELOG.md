# Changelog

## Unreleased

Inspired by the Dynamic Island on the new MacBook Pro.

- **Search in the island.** Find apps, Settings pages, files and folders, and get instant sums and unit conversions ("15% of 80", "5 km to mi"). Open it with the search icon, Alt+Space (when no other app owns it), or just start typing in the open panel. Everything is searched locally; it learns what you open most.
- **Island shape.** The docked island is now a black pill a few pixels below the top edge, like the new MacBook Pro. The fused notch is still available in Settings › Island Shape.
- **Downloads and Nearby Share.** Finished downloads and received files show in the island with Open and Show in folder.
- **Calls.** Incoming Phone Link calls show as a ringing activity until the call ends.
- **Mouse & Touch settings.** Hover delay, scroll for volume, sideways skip, middle-click play/pause. On touchscreens: tap or flick down to open, flick up to close, hold then drag to move, with larger controls.

## 2.0.0

A ground-up redesign. FLOAT is now a MacBook-style notch for Windows.

### Design
- **The notch.** Solid black, flush with the top edge, drawn as one vector outline with Apple-style continuous corners and the small ears where it meets the screen edge. It grows to fit what is live.
- **Float it.** Drag the notch off the top and it becomes a floating pill; drop it back near the edge to dock it.
- **Real glass.** The floating pill and panel blur what is actually behind them (Windows 11), with a lit rim and gloss. Styles: Auto, Glass, Black, with an adjustable tint.
- **One design system.** One typeface (Inter), one icon family, one spacing and corner scale across every view.
- **Motion.** Springs follow Animation Intensity; content blurs and scales as it changes; the island squishes when pressed.

### The panel
- **Focused Home.** The player (or a large clock) and one line: time, weather, your next event or task.
- **Tray.** Drop files on the notch to park them and drag them out into any app; plus a clipboard history of recent text and images.
- **Tasks.** A simple local to-do list.
- **Timer.** Type any duration or tap a preset; stopwatch included. Counts down live in the notch and chimes when done.
- **Controls.** Wi-Fi and Bluetooth switches, nearby networks to join, paired devices, volume and brightness, battery, Focus status, and CPU / memory / network speed.
- **Hover to open**, a global hotkey, and a tray icon.

### Live in the notch
- An equalizer driven by the actual audio, tinted by the album art.
- Notifications with the sending app's real icon; music moves to a side bubble while one shows.
- Volume and brightness when you use the keys or scroll on the notch; charging and low battery; Bluetooth devices connecting; Focus changes; camera and microphone indicators.
- Synced lyrics, weather and a calendar's next event (each opt-in; these are the only features that use the network).

### Under the hood
- The island lives in one fixed click-through window; morphs never resize it, and the space around it no longer blocks clicks.
- Hides over fullscreen apps, remembers its position, launches at startup, single instance.
- Fixed: media controls could target the wrong app; notifications at startup were lost; notifications never arrived in unpackaged builds; Focus status went stale; Escape did not close the panel.

### Upgrading from 1.x
- Saved appearance settings move to the new defaults once.
- A short welcome explains the new gestures on first launch.

## 1.0.1

- Stabilized the interaction model. See the Git history for details.
