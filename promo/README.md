# FLOAT launch film

A 73-second, 1080×1080 film for LinkedIn, built from FLOAT's own island shape
(`src/island/shape.ts`) with demo content. Narration: Microsoft neural voice
"Ryan" via [edge-tts](https://github.com/rany2/edge-tts).

Rebuild:

1. Edit lines in `script.json`, then narrate them (needs `pip install edge-tts` and FFmpeg):
   `python make_voice.py` → `voice/*.mp3` + `voice/timing.json`
2. Start the dev server from the repo root: `npx vite --port 1421`
   Preview in a browser: http://localhost:1421/promo/film.html (`?t=20` jumps, `?still&t=20` freezes)
3. Render (needs Chrome): `cd render && npm install && node render.mjs`
   Stills only: `node render.mjs --stills 2,14,40`
4. Add narration, music and whooshes: `node mix.mjs` → `out/float-film.mp4`

Every frame is a pure function of time (`film.ts` → `render(t)`), so renders
are exact and repeatable.
