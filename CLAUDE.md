# showerhacks-2026 (Unprompted)

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
- Must be **Discord friendly**: intended to run as a Discord Activity (embedded iframe via the Discord Embedded App SDK), so the UI has to work at small/odd sizes (PiP, mobile portrait) and avoid loading external resources directly (Discord's CSP only allows proxied URLs under `/.proxy/`), so no externally hosted fonts or CDN assets (bundle them instead).
- The game is named **Unprompted** (formerly PromptPhone). The user supplied a design kit (stylesheet, wordmark markup, favicon) that replaced the earlier Catppuccin Mocha theme: warm paper background with a dot grid, ink text, chunky 2.5px ink borders with hard offset shadows, tomato primary, sticky-note yellow, grape focus rings. Tokens (`--u-*`, plus `--player-*` for the server's player colour names) live in `client/src/index.css`; the `Wordmark` component is in `client/src/components/ui.jsx`; the favicon is `client/public/favicon.svg`. Fonts (Bricolage Grotesque, Figtree, Caveat) are bundled via `@fontsource` packages imported in `client/src/main.jsx` instead of Google Fonts, to satisfy Discord's CSP.
- Frontend: **React** (Vite) in `client/`.
- The user requested a summary of how the game could become a Discord app for voice calls.
- For this Discord setup task, the user deferred game server and image model work to focus on getting the UI to appear and open as a Discord Activity. Remote updates subsequently added the multiplayer backend described below.
- The user requested adding the minimal Discord SDK connection to `client/src/main.jsx`.
- The user requested instructions for installing the app in Discord.
- The user requested pulling remote updates with rebase while preserving the current local changes.
- The user requested instructions for running the game server and an explanation of how the frontend connects to it.
- The user requested committing and pushing the Discord setup changes.
- The user wants to run the game on a website and asked for a recommended hosting setup.
- The user requested making the Discord Activity compatible with the multiplayer server.
- The user requested running the client and server from one server so the frontend can connect through relative `/api` URLs.
- The user reported `OAuth2 Error: invalid_request: Missing "redirect_uri" in request`. Discord's Activity setup requires a saved OAuth2 redirect URL in the Developer Portal (the official placeholder is `https://127.0.0.1`); the SDK handles the redirect. The app now explains this configuration step when authorization reports a redirect URI error.
- After adding the redirect URL, the user reported `Could not sign in with Discord. Close and reopen the Activity.` and asked to continue troubleshooting. The running cloudflared tunnel targeted `http://localhost:5173`; token requests there returned HTTP 404, while port 3001 served the API. Sign-in errors now distinguish missing endpoints, network failures, and invalid responses. A local ignored `server/.env` template is prepared for the user to fill in the OAuth2 client secret.
- The user asked why the frontend and API used different ports and requested the same port. The combined server now defaults to 5173, and the local PORT setting is updated to match the existing tunnel. Old standalone frontend and game server processes are replaced with the combined development server. Keep the existing tunnel to port 5173; no new tunnel hostname is needed.
- The user requested committing and pushing the combined server and Discord multiplayer integration changes.
- The user asked for a Python API (prompt in → image out) and was worried about non-players using it for free images; it must only be usable by people playing the game.
- The user requested SDXL on MLX for imagegen (dev machine: M1, 8GB RAM).
- The user asked to make sure the website's image generation is plugged into the Python API, then to push (pulling/rebasing if needed). Generated image URLs now go through `backendUrl` so they get the `/.proxy` prefix in Discord.
- The user requested another pull with rebase; it fast-forwarded to the remote's Discord nicknames/profile pictures commit.
- The user asked to remove the empty root `sd_model.py`; it was deleted.
- The user requested removing the ability to change names in the game and using Discord nicknames. Names are read-only: prefer the Activity server nickname, then Discord display name, then username. Browser previews receive assigned `Player N` names.
- The user requested Discord profile images. Avatars prefer the server-specific profile picture, then the account picture, then Discord's default avatar. The shared avatar component uses initials for browser guests or failed image loads; verified images load through `/api/avatars/` so the existing Activity URL mapping works.
- The user requested pulling with rebase and committing the nickname and profile-image changes.
- The user requested configuring the local Stable Diffusion image service and its connection to the game, then checking that image generation works.
- The user requested committing the working image-generation setup and fix.
- The user asked what else should be added to the game; this is a prioritization discussion, with no additional feature implementation requested yet.
- The user requested making the rounds setting work. The selected count must be played even when there are fewer players, with chains rotating again as needed.
- The user requested restoring the name option for web players and committing and pushing the changes. Browser players can edit **Your name** in the lobby; the name is remembered per tab with an in-memory fallback. Discord names remain read-only.
- The user requested another pull with rebase; it fast-forwarded to the remote's dedicated MLX worker commit, and the local CLAUDE.md notes were merged in.
- The user requested another pull with rebase; it fast-forwarded to the remote's web-player names, lobby, and rounds commit, and the local CLAUDE.md notes were merged in.
- The user requested a slider that changes the model's temperature/creativity.
- The user requested scoring with DINOv2 ViT-B/14 and a leaderboard of who scores best against the reference image. They said the DINOv2 model itself doesn't need to be tested.
- The user requested another pull with rebase; it fast-forwarded to the remote's redesign and scoring updates, preserving the local Chroma model and image testing changes and merging the image API conflict.

- The user requires keeping Chroma and wants approximately 10 seconds maximum per image. Do not switch to SDXL-Turbo to meet the target. Chroma speed work uses a pinned Flash adapter, float16 on MPS, short text padding, synchronized sampling, and a startup warmup; keep the original HD mode available with IMAGE_FLASH=0.
- The user requested committing and pushing the Chroma Flash and local image playground changes.

## Current status
- **Multiplayer backend** (`server/`): Node + `ws` WebSocket server, server-authoritative. `server/game.js` holds the room/game logic (lobby → play turns → reveal); `server/index.js` wires up HTTP/WebSocket and serves `client/dist` in production. Clients get a per-player view of state only, so nobody can see other chains early.
- **Image API** (`imagegen/`, Python/FastAPI): `POST /generate {prompt, style}` → PNG. Locked down so only the game can use it: binds to 127.0.0.1 only, requires `Authorization: Bearer $IMAGE_API_SECRET`, no docs pages. Players' browsers never call it — only the Node server does, from `server/images.js`, when a turn ends. Node keeps the PNGs in memory and serves them same-origin at `/images/<uuid>.png` (route in `server/app.js`) (deleted when the game/room ends). The secret lives in gitignored `imagegen/.env` and `server/.env` (must match).
- The image model is `imagegen/model.py`: Chroma1-HD through PyTorch/Diffusers. Default fast mode fuses the pinned rank-64 Chroma Flash adapter in `imagegen/chroma_flash.py` at startup, uses 384×384 / 6 steps / guidance 1, and warms the GPU before becoming ready. Set IMAGE_FLASH=0, IMAGE_SIZE=512, IMAGE_STEPS=20 for the original HD mode. Art-style suffixes and the host's Creativity slider still apply. Image loading and generation stay on the same dedicated worker, and image requests are serialized. The vendored `stable_diffusion` package is retained but is not the active model.
- Local Chroma generation is configured in the ignored environment files. On September 26, 2026, six prompts across all six styles through the game server took 5.908–6.604 seconds each (mean 6.24s) on the M3 Max / 128 GB at 384×384, six steps, Flash enabled. PNGs were inspected, and DINOv2 scoring returned a valid normalized 768-dimensional vector in 0.107s. These measurements exclude startup and queued requests; competing GPU work can increase latency. Image service logs are in /private/tmp/promptphone-chroma-fast.log. Python checks: imagegen/.venv/bin/python -m unittest discover -s imagegen -p 'test_*.py'.
- **Scoring**: `imagegen/scorer.py` embeds images with DINOv2 ViT-B/14 (`facebook/dinov2-base` via PyTorch/transformers on CPU, own worker thread) behind `POST /embed` (PNG body → unit-length CLS embedding, same secret). After each image is generated, Node calls it (`embedImage` in `server/images.js`). A chain's first image (from the original prompt) is its **reference**; each guess scores `round(max(0, cosine) × 100)` for how close its image is to that reference. Timed-out guesses score 0, and guesses whose image fails aren't scored. With the image model on, final guesses are drawn and scored as well (`play.finishing`) before the reveal, so chains end on an image. Scores show as `+N` on guesses during the reveal; after the last chain, the host shows a **Leaderboard** that totals each player's guess points. Prompts earn nothing. With no image API, there are no scores or leaderboard, and chains end on a guess as before.
- Between turns the game waits for all images before starting the guess timer (`generating` state, `msLeft: null`). If `IMAGE_API_URL` is unset or generation fails, the step falls back to the seeded placeholder gradient from `client/src/mock.js`.
- Client connects via `client/src/net.js` (`useRoom`) to same-origin `/api/ws` in browsers and `/.proxy/api/ws` in Discord. The Node server serves both React and `/api` on port 5173 in development and production; development embeds Vite middleware with hot reload, with no separate frontend port. Browser room is picked with `?room=<code>` (default `"default"`); browser player id is per-tab (sessionStorage), with an in-memory fallback if storage is blocked.
- Rules: play exactly the selected number of rounds (first prompt, then guesses), cycling chains through the players again when needed; ≥2 players to start; host controls settings, start, and reveal stepping; drafts stream to the server so typed text counts on timeout; disconnected players are skipped for the turn.
- The user plans to implement the image model themselves (in `imagegen/model.py`).
- `client/src/session.js` initializes the Discord SDK only when launched with `frame_id`, then completes `identify` OAuth before joining, adding `guilds.members.read` in Discord servers to read nicknames. Default Application ID is `1553470711308353626` (override with `VITE_DISCORD_CLIENT_ID` and matching server `DISCORD_CLIENT_ID`). A shared initialization promise avoids duplicate SDK handshakes under React StrictMode.
- Discord rooms use the SDK Activity instance ID in a separate namespace. The server verifies the access token via Discord's `/oauth2/@me` endpoint, derives player ID/display name from that response, and prefers the nickname from `/users/@me/guilds/{guildId}/member` for server Activities. Reconnection preserves a Discord user's seat and refreshes their name while the room exists; ordinary browser play still needs no credentials. Name overrides and rename messages are ignored for Discord players; browser players can rename themselves in the lobby.
- `server/index.js` loads optional `server/.env`; `server/app.js` serves HTTP/WebSocket and `POST /api/token`; `server/discord.js` handles code exchange and identity verification. Set `DISCORD_CLIENT_SECRET` only on the server. Both directories include `.env.example`, and actual `.env` files are ignored. Root `README.md` documents local, Discord, and production setup.

## Commands
```
npm run setup                            # install client and server dependencies
npm run dev                              # one server at http://localhost:5173, including React hot reload
npm run build && npm start               # build React, then serve app and /api on :5173
npm test && npm run lint                  # client/server checks
cd imagegen && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python app.py   # image API on 127.0.0.1:8000 (optional)
```
