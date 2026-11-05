"""Cut the screen recordings in clips/ into the short pieces the film plays.

    python cut_clips.py   -> clips/cut/<id>.mp4

Each piece is trimmed, sped up where the narration is shorter than the
action, cropped to the island at 16:10 and scaled to 1280x800. Every frame
is a keyframe so the renderer can seek to any frame exactly. The music
clip's album cover and song title are blurred (they aren't ours to show).
Snipping Tool sometimes drops black blocks on the left of a frame; those
frames are replaced with the last clean one.
clips/ is kept out of git: it's the author's own recordings.
"""
import json
import subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
SRC = HERE / "clips"
OUT = SRC / "cut"

# Regions to blur, in source pixels: (x, y, w, h).
PILL_ART = [(784, 10, 162, 40)]
PANEL_ART = [(614, 68, 180, 180), (808, 74, 182, 60)]

# id: (source, in, out, speed, crop (x, y, w, h), blur)
PIECES = {
    "work-pill": ("c1", 13.4, 16.8, 1.0, (556, 0, 800, 500), PILL_ART),
    "work-panel": ("c1", 4.6, 8.4, 1.0, (479, 0, 954, 596), PANEL_ART),
    "focus": ("c5", 3.4, 13.6, 1.17, (431, 0, 1056, 660), []),
    "text": ("c8", 2.6, 9.8, 1.25, (319, 0, 1280, 800), []),
    "paste": ("c7", 0.0, 4.0, 1.06, (319, 0, 1280, 800), []),
    "search-apps": ("c2", 23.45, 26.6, 1.0, (503, 0, 912, 570), []),
    "search-maths": ("c2", 15.5, 18.9, 1.0, (503, 0, 912, 570), []),
    "craft-glass": ("c6", 1.6, 7.6, 1.35, (376, 0, 1165, 728), []),
    "craft-spring": ("c6", 21.4, 24.4, 1.4, (376, 0, 1165, 728), []),
}


# The left edge holds only wallpaper in every recording, so pure black there
# is a glitch, never content.
GLITCH_X = 470
GLITCH_PIXELS = 40


def size(path: Path) -> tuple[int, int]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    stream = json.loads(out)["streams"][0]
    return stream["width"], stream["height"]


def cut(piece: str, src: str, start: float, end: float, speed: float, crop, blur) -> None:
    path = SRC / f"{src}.mp4"
    width, height = size(path)
    chain = "[0:v]"
    graph = []
    for i, (x, y, w, h) in enumerate(blur):
        graph.append(f"{chain}split[base{i}][part{i}];[part{i}]crop={w}:{h}:{x}:{y},gblur=sigma=16[soft{i}];[base{i}][soft{i}]overlay={x}:{y}[v{i}]")
        chain = f"[v{i}]"
    x, y, w, h = crop
    graph.append(f"{chain}setpts=(PTS-STARTPTS)/{speed},fps=30,crop={w}:{h}:{x}:{y},scale=1280:800:flags=lanczos,format=yuv420p[out]")
    decode = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(end - start), "-i", str(path), "-r", "30", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    encode = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", "30", "-i", "-",
            "-filter_complex", ";".join(graph), "-map", "[out]", "-an",
            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-g", "1", "-movflags", "+faststart",
            str(OUT / f"{piece}.mp4"),
        ],
        stdin=subprocess.PIPE,
    )
    frame_bytes = width * height * 3
    last_clean = None
    fixed = 0
    run = longest = 0
    while chunk := decode.stdout.read(frame_bytes):
        if len(chunk) < frame_bytes:
            break
        frame = np.frombuffer(chunk, np.uint8).reshape(height, width, 3)
        glitched = int((frame[:, :GLITCH_X].max(axis=2) < 6).sum()) > GLITCH_PIXELS
        if glitched and last_clean is not None:
            chunk = last_clean
            fixed += 1
            run += 1
            longest = max(longest, run)
        elif not glitched:
            last_clean = chunk
            run = 0
        encode.stdin.write(chunk)
    encode.stdin.close()
    decode.wait()
    if encode.wait() != 0:
        raise SystemExit(f"encoding {piece} failed")
    print(f"{piece:14} {(end - start) / speed:.2f}s  {fixed} glitched frames replaced (longest run {longest})")


OUT.mkdir(parents=True, exist_ok=True)
for piece, spec in PIECES.items():
    cut(piece, *spec)
