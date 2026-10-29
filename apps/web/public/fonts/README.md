# Self-hosted Safethrift marketing fonts

These intentional production assets are used only by the marketing design layer.
They are open-source fonts, not a new runtime package dependency. No font request
is made to Google at runtime. Both licences are retained alongside the binaries.

Downloaded 2026-10-29 from the Google Fonts distribution of the upstream families:

- Newsreader: https://github.com/productiontype/Newsreader
- Source Sans 3: https://github.com/adobe-fonts/source-sans

WOFF2 Latin variable subsets cover the English marketing copy. System fallback is
available for glyphs outside the subset. Normal style only; CSS declares display
weights 400–600 and UI weights 400–700, with `font-display: swap`.

Distribution URLs:

- https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjA.woff2
- https://fonts.gstatic.com/s/sourcesans3/v20/nwpStKy2OAdR1K-IwhWudF-R3w8aZQ.woff2

| File                               |  Bytes | SHA-256                                                            |
| ---------------------------------- | -----: | ------------------------------------------------------------------ |
| newsreader-latin-variable.woff2    | 132000 | `6e4f2958c3a7c4a80acde4e5a679abe7e01bc1e30b92be3c7a8b696ef401d101` |
| source-sans-3-latin-variable.woff2 |  28872 | `19143dca075972bc84e3fd9eab7416dd40cc565dccb2435a044bdfabe060c7d5` |
