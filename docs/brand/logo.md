# SMART PLATFORM — Logo

**The idea:** one bold geometric "S" built from two circular arcs that meet tangentially at the centre. The last
60° of the lower-left terminal is bronze; the cut between indigo and bronze is a clean vertical line, and that
seam is the mark's signature.

## Colour

| Role                       | Hex       |
| -------------------------- | --------- |
| Indigo (primary)           | `#2548D9` |
| Bronze (accent terminal)   | `#B8733A` |
| White (reversed S)         | `#FFFFFF` |
| Ink (dark surfaces / text) | `#070D1D` |

Wordmark: **Montserrat ExtraBold**, uppercase, outlined to paths in every shipped file (no live text).

## Geometry

Master viewBox `0 0 256 256`. Arc radius 38, stroke 36 → counters radius 20, ink box 112 × 188 centred on (128,128).
The seam is the vertical cut at x = 128 (y 186 → 222). Never re-cut it.

## Clear space

Keep **0.25 × S height** (≈ 47 of 188 units, about a quarter of the letter) free on all four sides of the symbol
and of the lockup. Nothing — text, edges, other logos — enters that zone.

## Minimum sizes

| Asset                          | Minimum                                               |
| ------------------------------ | ----------------------------------------------------- |
| Symbol (`logo-mark*.svg`)      | 24 px tall (16 px only via the favicon drawing below) |
| Horizontal lockup (`logo.svg`) | 140 px wide (≈ 25 mm in print)                        |
| Favicon (`favicon.svg`, 16 px) | 16 × 16 px — uses a dedicated tab-icon drawing        |

The favicon / app icon is a different drawing: white S (stroke 32, no bronze) on a solid indigo rounded tile
(rx ≈ 23%). The bronze would vanish at 16 px and the full-weight stroke begins to close its counters.

## Files (`public/`)

- `logo/logo.svg`, `logo/logo.png` — horizontal lockup (840 × 256)
- `logo/logo-mark.svg` — colour symbol; `-white` (white S, bronze kept, for dark surfaces), `-black`, `-mono-bronze`
- `logo/logo-mark-email.png` (160 px), `logo/logo-mark-1024.png` — raster symbol, transparent
- `favicon.svg`, `favicon.ico` (16/32/48), `favicon-*.png`, `apple-touch-icon.png`, `android-chrome-*.png`,
  `favicon-maskable-512x512.png` (S inside the central 72%), `site.webmanifest`
- `og-image.png` — 1200 × 630 social card

## Do not

- Do not recolour the S, swap indigo and bronze, or use any colour outside the tokens.
- Do not move, soften, overlap or rotate the bronze seam.
- Do not add gradients, shadows, glows, outlines or 3D effects.
- Do not put the full-colour mark on mid-tone backgrounds — use the white or one-colour variants there.
- Do not stretch, skew, re-typeset the wordmark, or rebuild the lockup by hand.
