# zala-render

Video rendering machine for the ZALA VIP YouTube channel. It turns a script (JSON) and a narration file into a
finished documentary-style video using open-license images and footage (Wikimedia Commons, Pixabay) and ffmpeg.

This repository holds code only. It holds no keys, no scripts, no audio and no video.
Keys are GitHub Actions secrets; scripts, narration and finished renders live in private cloud storage.

## Run in the cloud

Actions → "Render episode" → Run workflow → enter the episode id (for example `ZV003`).

Required repository secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `PIXABAY_API_KEY`.

## Run locally

```
cd media
npm ci
node tools/fetch-fonts.mjs
node tools/prep-assets.mjs ../content/youtube/<id>.json
node cinema.mjs ../content/youtube/<id>.json final
```

Narration is expected at `media/cache/voice/<id>.mp3`.

## Quality gates in this repository
- `tools/prep-assets.mjs` and `tools/review-sheets.mjs`: every image is matched to its query and written to numbered review sheets.
- The workflow fails a render whose loudness is outside -17..-12 LUFS or whose true peak is above -0.5 dBFS.
