# The Director Games Studio Website

This is a React/Vite one-page studio site. The website content is intentionally
kept in one place so you can update the site without searching through the
layout code.

## Edit the site here

Open:

```text
src/config/siteConfig.ts
```

After saving, the Vite preview reloads automatically. The production build also
uses this same config.

## What you can edit

### Brand and loading screen

Update `brand` to change:

- Studio name and logo alt text
- Loading video
- Loading sound
- Accessibility labels for the intro

Assets belong in:

```text
public/assets/
```

Use the path relative to `public` in the config:

```ts
introVideo: 'assets/my-intro.mp4',
introSound: 'assets/my-loading-sound.mp3',
logo: 'assets/my-logo.png',
```

The loading sound is attempted automatically when the splash opens. Some
browsers block unmuted autoplay until the visitor interacts with the page; that
browser rule cannot be overridden by the website.

You can also adjust:

```ts
introExitDurationMs: 720,
introFallbackDurationMs: 5600,
introSoundVolume: 0.72,
```

### Navigation

Edit `navigation` to change the menu labels, anchor targets, and order:

```ts
{ id: 'games', label: 'Games', href: '#games' }
```

The `href` should point to a section `id` already present in the page unless you
are also changing the layout.

### Hero / landing section

Edit `hero` to change:

- The large heading
- The accent line of the heading
- Intro paragraph
- Explore button label and target

Example:

```ts
title: {
  leading: 'Games with',
  accent: 'direction.',
},
introduction: {
  lead: 'The Director Games',
  body: 'is a tiny studio making strange, warm, replayable worlds.',
},
```

### First look / reel section

Edit `reel` to change:

- Section title and supporting note
- Image and alt text displayed in the reel panel
- Caption

Reel images belong in:

```text
public/assets/
```

### Selected games

Add, remove, or reorder cards in `games.projects`. Each project supports:

- `id`
- `title`
- `type`
- `year`
- `description`
- `modalDescription`
- `visual`

There are three built-in visual treatments:

```text
game-visual-one
game-visual-two
game-visual-three
```

Use one of these values to keep the existing art direction. New visual
treatments can be added in `src/index.css`.

Clicking a card opens its project detail modal automatically.

### Studio / manifesto section

Edit `studio` to change:

- The manifesto headline lines
- Manifesto paragraph and attribution
- Working brief label
- Working brief paragraphs
- Studio method rows

The `manifesto.lines` array alternates between regular and indented lines.
Keep four lines for the current visual rhythm, or add/remove lines if you want
to change the composition.

### Notes section

Edit `notes` to change:

- Section title and description
- Aside copy
- Date, title, description, and destination for each note

Each note has its own `href`, so it can link to a future article, external
page, or the contact section.

### Footer and contact

Edit `footer` to change:

- Footer description
- Footer logo and logo alt text
- Contact headline
- Contact email and link label
- Newsletter placeholder, labels, and success message
- Copyright text
- Back-to-top label
- Social URLs and labels

Social icons currently support:

```text
instagram
youtube
twitter
```

Change the `href` values to the studio's real profiles. The icons are rendered
from the `icon` value, so keep it paired with the correct platform.

### Browser metadata

Edit `meta` to change the browser title and description. The page also updates
its description, Open Graph, and Twitter metadata from this config when it
loads. The fallback values are duplicated in `index.html` for crawlers that do
not execute JavaScript.

## Files you normally do not need to edit

- `src/App.tsx` — layout and interactions
- `src/index.css` — typography, responsive layout, and visual styling
- `index.html` — metadata fallback and favicon

Only edit `App.tsx` when you need a new type of interaction or a new layout
structure. For normal copy, links, games, notes, media, and social updates,
use `src/config/siteConfig.ts`.

## Verify changes

From the workspace root:

```bash
pnpm --filter @workspace/director-games run typecheck
PORT=20797 BASE_PATH=/ pnpm --filter @workspace/director-games run build
```

The website preview is served by the configured `artifacts/director-games`
workflow.