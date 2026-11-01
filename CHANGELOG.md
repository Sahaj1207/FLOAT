# Changelog

## 2.2.1

- **Calendar link check.** Settings › Widgets › Calendar now says whether your link works ("Connected · next: Standup, Mon 9:00") or why not. Pasting Google's public address for a private calendar explains that you need the "Secret address in iCal format" instead.

## 2.2.0

Two productivity features, after Apple's Focus and Live Text.

- **Focus Sessions.** Pick a task (or type one), choose 25, 50 or any minutes, and the island becomes that task: a progress ring and countdown that stay with you while you work. When time's up: Done (ticks the task off), +5, or a break (5 min, 10 after a long session). Start from Focus & Timer, the target button on any task, or search ("focus", "focus 50", "focus report 25"). Today's focus time, sessions and streak stay on your PC.
- **Calm notifications while focusing.** FLOAT holds its notification banners and shows a short summary when the session ends, or just the unread dot (Settings › Focus Sessions). Calls always come through.
- **Meeting countdown.** With your calendar linked, the next meeting appears in the island 10 minutes before, counting down, with **Join** for Teams, Zoom, Meet and Webex links. A meeting starting pauses your focus session.
- **Copy Text from Anything.** Press Ctrl+Alt+T (or search "copy text"), drag over any part of the screen, and its text is copied, even from images, videos and screenshots. Recognition runs on your PC with Windows' built-in text recognition. `float.exe --copy-text` starts it too, for your own shortcuts.

## 2.1.2

Inspired by the Dynamic Island on the new MacBook Pro.

- **Search in the island.** Find apps, Settings pages, files and folders, and get instant sums and unit conversions ("15% of 80", "5 km to mi"). Open it with the search icon, Alt+Space (when no other app owns it), or just start typing in the open panel. Everything is searched locally; it learns what you open most.
- **Island shape.** The docked island is now a black pill a few pixels below the top edge, like the new MacBook Pro. The fused notch is still available in Settings › Island Shape.
- **Downloads and Nearby Share.** Finished downloads and received files show in the island with Open and Show in folder.
- **Calls.** Incoming Phone Link calls show as a ringing activity until the call ends.
- **Updates from inside FLOAT.** Settings › Updates › Check for updates. FLOAT only asks GitHub when you press it, downloads the right installer for your copy, checks it against GitHub's published checksum and opens it.
- **Smoother music controls.** Play/pause responds the instant you tap and its icon morphs between the two shapes. Resting the pointer on the island's play button no longer opens the panel, so you can play and pause right from the pill.
- **New waveform.** The three bouncing bars are now a five-bar waveform that follows six frequency bands of what's playing, moves on springs at 60 fps, and settles into dots when paused.
- **Music waves.** Open the island while music plays and soft glowing waves flow along the bottom, tinted by the album art: bass, mids and treble each move one layer. Turn them off in Settings › System › Music Waves.
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
