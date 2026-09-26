# showerhacks-2026

## Standing instruction
Anything the user says about the project should be recorded in this file so it persists across sessions.

## The game
A Gartic Phone–style party game, but with an AI image model doing the drawing:
1. A player writes a text prompt.
2. An image model generates an image from that prompt.
3. The next player sees only the image and has to guess the prompt.
4. That guess becomes the next prompt, gets turned into an image, and so on down the chain.
5. At the end, every chain is revealed step by step (prompt → image → guess → image → …).

## Platform
- Must be **Discord friendly**: intended to run as a Discord Activity (embedded iframe via the Discord Embedded App SDK), so the UI has to work at small/odd sizes (PiP, mobile portrait), use Discord's dark palette, and avoid loading external resources directly (Discord's CSP only allows proxied URLs under `/.proxy/`), so no web fonts or CDN assets.
- Frontend: **React** (Vite) in `client/`.

## Current status
- UI only. Screens live in `client/src/screens/` and run on mock data from `client/src/mock.js`; there is no backend, Discord SDK integration, or image model hooked up yet.
- A dev-only screen switcher (bottom-left) lets you jump between screens.

## Commands
```
cd client
npm install
npm run dev      # http://localhost:5173
npm run build
```
