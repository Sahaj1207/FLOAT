"""Narrate script.json scene by scene with a Microsoft neural voice (edge-tts),
saving one MP3 per scene and the word timings the film uses for captions.

    python make_voice.py            -> voice/<id>.mp3 and voice/timing.json
    python make_voice.py search     -> only re-narrate the named scenes
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

import edge_tts

HERE = Path(__file__).parent
OUT = HERE / "voice"


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out.strip())


async def narrate(text: str, voice: str, rate: str, path: Path) -> list[dict]:
    words = []
    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    # Written next to the old file and swapped in only once it's complete.
    partial = path.with_suffix(".part")
    with partial.open("wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # Offsets come in 100 ns units.
                words.append({
                    "word": chunk["text"],
                    "start": chunk["offset"] / 1e7,
                    "end": (chunk["offset"] + chunk["duration"]) / 1e7,
                })
    partial.replace(path)
    return words


async def main() -> None:
    script = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)
    only = set(sys.argv[1:])
    timing_path = OUT / "timing.json"
    previous = {s["id"]: s for s in json.loads(timing_path.read_text(encoding="utf-8"))} if only and timing_path.exists() else {}
    timing = []
    for scene in script["scenes"]:
        path = OUT / f"{scene['id']}.mp3"
        if only and scene["id"] not in only and scene["id"] in previous:
            timing.append(previous[scene["id"]])
            continue
        words = await narrate(scene["text"], script["voice"], script["rate"], path)
        timing.append({"id": scene["id"], "text": scene["text"], "duration": duration(path), "words": words})
        print(f"{scene['id']:8} {timing[-1]['duration']:.2f}s  {len(words)} words")
    (OUT / "timing.json").write_text(json.dumps(timing, indent=2), encoding="utf-8")


asyncio.run(main())
