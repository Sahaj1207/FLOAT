# FLOAT launch film

A ~80-second, 1080×1080 film for LinkedIn, built from FLOAT's own island shape
(`src/island/shape.ts`) with demo content. Narration: Microsoft neural voice
"Ryan" via [edge-tts](https://github.com/rany2/edge-tts).

Rebuild:

0. The feature scenes are the author's screen recordings, kept out of git in
   `clips/` (c1 music, c2 search, c5 focus, c6 glass, c7 paste, c8 Copy Text).
   `python cut_clips.py` trims, crops and speeds them up into `clips/cut/`,
   blurs the song's cover and title, and repairs Snipping Tool's glitch frames.
1. Edit lines in `script.json`, then narrate them (needs `pip install edge-tts` and FFmpeg):
   `python make_voice.py` → `voice/*.mp3` + `voice/timing.json` (`python make_voice.py search` re-narrates one line)
2. Start the dev server from the repo root: `npx vite --port 1421`
   Preview in a browser: http://localhost:1421/promo/film.html (`?t=20` jumps, `?still&t=20` freezes)
3. Render (needs Chrome): `cd render && npm install && node render.mjs`
   Stills only: `node render.mjs --stills 2,14,40`
4. Score: `node music.mjs` → `out/music.wav`, an original 110 BPM track synthesised
   to the film's timeline (intro, riser, drop on "Meet FLOAT", groove, breakdown,
   end hit) with UI sounds on the picture's events
5. Mix narration over the score: `node mix.mjs` → `out/float-film.mp4`

Scenes start on the score's beat grid (big moments on a bar), with Apple-style
one-word title cards before each feature. Every frame is a pure function of time (`film.ts` → `render(t)`), so renders
are exact and repeatable.
