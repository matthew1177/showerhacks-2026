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
- Must be **Discord friendly**: intended to run as a Discord Activity (embedded iframe via the Discord Embedded App SDK), so the UI has to work at small/odd sizes (PiP, mobile portrait) and avoid loading external resources directly (Discord's CSP only allows proxied URLs under `/.proxy/`), so no web fonts or CDN assets.
- The user requested [Catppuccin colors](https://github.com/catppuccin/catppuccin) for the UI, replacing the original Discord palette. The current theme uses **Mocha** with mauve accents; shared color tokens live in `client/src/index.css`.
- Frontend: **React** (Vite) in `client/`.

## Current status
- **Multiplayer backend** (`server/`): Node + `ws` WebSocket server, server-authoritative. `server/game.js` holds the room/game logic (lobby → play turns → reveal); `server/index.js` wires up HTTP/WebSocket and serves `client/dist` in production. Clients get a per-player view of state only, so nobody can see other chains early.
- The user asked for the text side only for now (prompts/guesses passed between players like text messages) — **no AI image model yet**. Image steps are an opaque random seed rendered as the placeholder gradient from `client/src/mock.js`.
- Client connects via `client/src/net.js` (`useRoom`) to same-origin `/ws` (Vite proxies it to port 3001 in dev, which keeps it inside Discord's CSP). Room is picked with `?room=<code>` (default `"default"`); player id is per-tab (sessionStorage) so multiple tabs = multiple players for testing.
- Rules: chain length = min(rounds setting, player count); ≥2 players to start; host controls settings, start, and reveal stepping; drafts stream to the server so typed text counts on timeout; disconnected players are skipped for the turn.
- No Discord SDK integration yet (room code should become the Activity instance id).

## Commands
```
cd server && npm install && npm run dev   # game server on :3001
cd client && npm install && npm run dev   # http://localhost:5173 (open several tabs to play)
cd client && npm run build                # then `cd server && npm start` serves everything on :3001
```
