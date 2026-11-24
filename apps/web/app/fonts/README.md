# Fonts

The three families the site uses are vendored here rather than downloaded from
Google at build time.

| File                        | Family        | Weights | Used for                    |
| --------------------------- | ------------- | ------- | --------------------------- |
| `Sora-Variable.woff2`       | Sora          | 100–800 | Headings, the monogram      |
| `Inter-Variable.woff2`      | Inter         | 100–900 | Body text                   |
| `JetBrainsMono-Variable.woff2` | JetBrains Mono | 100–800 | Figures in the dashboard |

Each file is the **variable** version of the family, so every weight in the
range comes from one download. They are the `latin` subset, matching the
`subsets: ['latin']` the Google loader used before.

## Why they are here

`next/font/google` fetches the CSS and the font files on every build. Two
things follow from that:

- The build needs network access to `fonts.googleapis.com` and
  `fonts.gstatic.com`. A slow, filtered or blocked connection fails the build.
- In Next 16's Turbopack build, asking a variable Google font for several
  weights registers the same underlying file once per weight, which trips an
  internal assertion (`next/font/google queries have exactly one entry`) and
  fails the build.

Vendoring removes both: there is nothing to fetch, and one file per family is
one entry per font.

## Updating a font

1. Open the family on [Google Fonts](https://fonts.google.com) and copy the
   `latin` subset file URL. With a desktop browser user agent the CSS comes
   back as:

   ```
   https://fonts.googleapis.com/css2?family=Sora:wght@100..800&display=swap
   ```

   The `latin` block in that response holds the URL to download.

2. Replace the `.woff2` here. Keep the name — `app/layout.js` refers to it.

3. Check the weight range in the new file's CSS response and update the
   `weight` option in `app/layout.js` to match.

The files are also licensed under the SIL Open Font License, the same terms
Google Fonts serves them under.
