# SketchIn-between

Interactive project page for **Learning Motion Correspondence for Generative Line-Art In-between**, based on `demo_sketch_present.key` and the supplied project media.

## Run locally

```sh
python3 -m http.server 4173
```

Open http://localhost:4173. The page needs HTTP because the media catalog is fetched as JSON.

## Experience

- Scroll through 46 individually decoded frames, forward or backward. Three scenes, manual frame slider, and playback controls are available.
- Explore 34 cases with category filters, viewport-aware muted playback, and a modal inspector with generated / ground-truth synchronization.
- Compare 11 supplied result / baseline variants across 8 scenes, synchronized by normalized time, with playback speed controls.
- Inspect 11 ablation scenes using the available variants for each scene.
- Keyboard controls, reduced-motion support, mobile layouts, offscreen video pausing, lazy media loading, and frame fallback are included.

All media links are relative, so the site works under a GitHub Pages project subpath. No application server, API keys, or build dependencies are needed. DM Sans and Manrope are self-hosted with system font fallbacks.

## GitHub Pages

Push the project to `YinHan-Zhang/sketchinbtween` on branch `main`. In the repository's **Settings → Pages**, select **GitHub Actions** as the source. `.github/workflows/pages.yml` validates the media catalog, packages only the website into `dist/`, and deploys it through the official Pages actions.

```sh
python3 scripts/build.py
node --check app.js
```

The original Keynote and extracted slide text are excluded from Git. Only the web page and selected project media are published.

## Update the supplied assets

`scripts/prepare-assets.py` copies the source case videos and endpoint images, generates posters and independent WebP frames, and writes `assets/manifest.json`. It uses FFmpeg, ffprobe, Python, and Pillow. Adjust its `SOURCE` path for another machine. The website itself has no Python or FFmpeg dependency.

`keyframes.mp4` is labeled **Wan2.1**, following the method mapping in the supplied comparison presentation. Dense, sparse, and multi-key names preserve the supplied media variants. Comparisons use normalized time because source clips contain different frame counts and durations. The website makes no numerical performance or publication-status claims.
