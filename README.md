# Unprompted

A multiplayer prompt-and-guess game for the web and Discord Activities. React/Vite
is in `client/`; the Node server in `server/` owns rooms and game state. An optional
local Chroma Flash / SDXL-Turbo service generates images; gradient placeholders are used when
the service is disabled or generation fails.

## Run locally

Use Node 22.12 or newer. From the project root:

```sh
npm run setup
npm run dev
```

Open `http://localhost:5173/?room=friends` in multiple independent tabs to play.
Browser players use a per-tab identity and can change **Your name** in the lobby.
Names are remembered in the current tab; new players start as `Player 1`, etc. Everyone with the
same room code joins together; omitting the code uses `default`. Browser play
does not require Discord credentials.

The host's **Rounds** setting is the total number of turns: everyone writes a
prompt in round 1, then guesses an image in each remaining round. Chains rotate
through the players again if there are more rounds than players. Choosing six
rounds with two players therefore plays all six rounds before the reveal.

One Node process serves the React app and backend on the same port. In development,
Vite runs inside that server to provide React hot reload. The frontend calls
relative `/api` URLs; there is no separate frontend port or backend host to configure.

| Path | Purpose |
| --- | --- |
| `/` | React app |
| `/api` | JSON status (`{ "status": "ok" }`) |
| `/api/token` | Discord OAuth code exchange (POST) |
| `/api/avatars/...` | Discord profile pictures (GET) |
| `/api/ws` | Multiplayer WebSocket |

`PORT` changes the port for both the frontend and backend. The old `/ws` endpoint
remains an alias for existing clients.

## Local image generation (Apple Silicon)

Install the image service dependencies once:

```sh
cd imagegen
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Set `IMAGE_API_URL=http://127.0.0.1:8000` in `server/.env`, and put the same
random `IMAGE_API_SECRET` (at least 16 characters) in both `server/.env` and
`imagegen/.env`. Both files are ignored by Git. Restart the game server after
changing its environment.

Start the image service in a separate terminal, from `imagegen/`:

```sh
.venv/bin/python app.py
```

The [Chroma1-HD model](https://huggingface.co/lodestones/Chroma1-HD) and its text
encoder download on the first run (roughly 28 GB). Fast mode also downloads a pinned
[Chroma Flash adapter](https://huggingface.co/darian23/Chroma1-Flash-LoRA) (469 MB),
which approximates Chroma1-Flash and is fused once during startup. It runs through
PyTorch/Diffusers on the Mac's GPU; allow substantial unified memory for the weights
and inference. Startup loads and warms it on a dedicated worker before accepting
requests, then loads the scoring model. Wait for
`Application startup complete` before playing. Keep this process running alongside
the game server. It listens only on `127.0.0.1:8000`; the game server authenticates
requests and serves generated PNGs through `/images/`, including Discord's
`/.proxy` route. The next guessing timer starts after all images are ready.

Before starting a game, the host chooses **Chroma Flash** (the default) or
**SDXL-Turbo** under **Settings → Image model**. Everyone sees the choice, and it
stays fixed through every round and final scoring. The server starts loading the
chosen model while players write their first prompts. The image playground
offers the same choices.

Chroma Flash defaults to 384×384 with six sampling steps. This trades
resolution and detail for short game turns while keeping Chroma. On Apple Silicon,
the service stores the transformer and T5 text encoder's linear weights as **INT8**,
with float16 activations, embeddings, and VAE (some text encoder layers retain their
original floating-point precision). The Flash adapter is fused before quantization.
Quanto freezes the weights once at startup, and a Chroma-specific linear layer uses
PyTorch's native Metal INT8 kernel. The service also uses shorter text padding, Metal
fast math, and synchronization between sampling steps to keep the GPU queue from
building up. Explicit
`PYTORCH_MPS_FAST_MATH` / `PYTORCH_MPS_PREFER_METAL` environment values take precedence.

Set `IMAGE_CHROMA_QUANTIZATION=none` in `imagegen/.env` and restart the image service
to restore the original floating-point weights; the default is `int8`. This applies
to both Chroma Flash and Chroma HD. SDXL-Turbo is unaffected. Quantization happens
after loading, so the original downloads and startup memory requirements remain.
The authenticated `/health` response reports `activeQuantization` for the loaded model.

On the M3 Max / 128 GB development Mac, two fixed-seed prompts at 384×384 / six steps
took **7.28–7.35 seconds each** with INT8 versus **5.73–6.06 seconds** with the original
floating-point weights (September 26, 2026). Allocated GPU tensor memory after warmup
dropped from **29.5 GB to 14.0 GB** (decimal GB, excluding allocator caches). Both
image pairs were visually inspected; small detail changes are expected. This saves
memory, with a modest latency cost in this comparison. Timings exclude startup and
queued requests, and vary with hardware and competing GPU work.
After restarting the image service, three requests through the game's
`/api/image-test` endpoint took **6.13–6.31 seconds**, including PNG encoding and
the HTTP response; all three generated images were inspected.

The [SDXL-Turbo model](https://huggingface.co/stabilityai/sdxl-turbo) uses 512×512,
one sampling step, and guidance disabled. Its weights download on first use
(roughly 14 GB). Only one image pipeline stays resident; switching models reloads
and warms the selected pipeline. Concurrent rooms using different models can
therefore add loading time when their requests alternate.

Set `IMAGE_FLASH_SIZE` / `IMAGE_FLASH_STEPS` or `IMAGE_TURBO_SIZE` /
`IMAGE_TURBO_STEPS` in `imagegen/.env` to adjust each profile, then restart the
image service. Sizes must be multiples of 16 and at least 256. `IMAGE_MODEL`
selects the service's startup default; games always pass their lobby selection.
Legacy `IMAGE_SIZE` / `IMAGE_STEPS` overrides affect only the service default.
For scripts using original Chroma HD, `IMAGE_MODEL=chroma-hd` retains 512×512 / 20
steps; `IMAGE_FLASH=0` is also supported when `IMAGE_MODEL` is unset.
Flash mode disables classifier-free guidance and negative prompting as required
by the adapter. Startup/download time and time spent waiting behind other requests
are separate from per-image generation time; hardware and competing GPU work affect latency.
The game server queues image requests one at a time, with a five-minute timeout
per image rather than per round; `IMAGE_TIMEOUT_MS` in `server/.env` overrides it.
Existing art-style and creativity settings still apply.

### Silly prompt modifiers

The **Creativity** slider now adds concrete visual jokes to generated images:
**Literal** (0–34) asks for a simple depiction, **Balanced** (35–62) uses the prompt
and art style as written, **Silly** (63–87) adds one random modifier, and
**Unhinged** (88–100) adds two. Try **75** for a single gag or **90** for a combination.
The default remains Balanced at 50.

Modifiers include enormous roller skates, wobbly jelly, a giant teacup, and an
audience of rubber ducks. Each image gets a fresh draw from 60 modifiers across
accessories, materials, settings, proportions, and onlookers. Two-modifier combinations
use different categories to avoid conflicting materials, locations, or proportions.
The model is asked to keep the main subject and action recognizable.
Modifiers are instructions to the model, so the resulting image may interpret them loosely.

The player's original prompt stays intact. Modifiers stay hidden during guessing
and appear as **The AI was told…** alongside their image in the reveal. The image
playground shows them immediately after generation. Scoring still compares each
guess's image to the chain's first image, so added visual gags can affect scores.
Restart the Python image service after updating to load the new modifier catalog;
an older service still returns images but won't provide modifier notes.

### Test a single image

Open [the image playground](http://localhost:5173/image-test) while the game and
image servers are running. Enter a prompt, choose a model, art style and creativity,
then generate, preview, or save a PNG without starting a multiplayer game.
The page checks model readiness automatically and shows elapsed generation time.
The playground also works at `/image-test` on the game's public tunnel URL, so
anyone with that link can generate images while the host's servers are running.
The shared secret stays on the server. Browser requests from unrelated sites
are rejected, and only one playground image can generate at a time.
If you changed `PORT`, use that port in the local URL.

## Connect the Discord Activity

The existing Application ID is `1553470711308353626`.

1. Copy `server/.env.example` to `server/.env`. Add the application's **OAuth2
   Client Secret** as `DISCORD_CLIENT_SECRET`, then restart the game server.
   The server reads this file automatically, or you can set environment variables
   through your hosting provider. The secret belongs only on the server.
2. If using a different Discord application, change `DISCORD_CLIENT_ID` in the
   server environment. Copy `client/.env.example` to `client/.env` and set the
   matching `VITE_DISCORD_CLIENT_ID`; restart the development server or rebuild
   the frontend.
3. In the [Discord Developer Portal](https://discord.com/developers/applications/1553470711308353626),
   enable Activities. Under OAuth2, add a redirect URI if there isn't one already
   (`https://127.0.0.1` is the placeholder used by Discord's Activity tutorial).
4. Run `npm run dev`, then expose the shared server with an HTTPS tunnel:

   ```sh
   cloudflared tunnel --url http://localhost:5173
   ```

5. Under **Activities → URL Mappings**, map `/` to the tunnel hostname, without
   `https://`. Use one mapping for the frontend, authentication, and WebSocket.
   The Node server handles the app and `/api` on port 5173. If the tunnel hostname
   changes, update the mapping.
6. Launch the Activity from Discord's App Launcher and authorize identity and
   server member access. Have another tester join the **same running Activity**.
   Both players should appear in one lobby with their Discord server nicknames
   (falling back to their display names, then usernames).

The client waits for the SDK, requests `identify` plus `guilds.members.read` when
launched in a Discord server, exchanges its authorization code through the server,
and authenticates with Discord. Direct-message Activities only need `identify`.
It connects to
`wss://<activity-origin>/.proxy/api/ws`; the token endpoint is `/.proxy/api/token`.
The server verifies the token with Discord and reads the current user's server
nickname through the [current-user guild member endpoint](https://docs.discord.com/developers/resources/user#get-current-user-guild-member)
before accepting a player. Access
tokens stay in memory and are sent in the initial WebSocket message, not in URLs.

Rooms use the Activity instance ID, so separate Activities cannot accidentally
share the browser's default lobby. Discord users keep the same player identity
on reconnect; opening a second connection replaces the old one. Discord names cannot be
edited in the game. Change your nickname in Discord and reopen the Activity to
refresh it; direct-message Activities use your display name or username.
Avatars use your server profile picture when set, then your account picture or
Discord's default avatar. They load through the shared server using the existing
Activity URL mapping. Browser guests and failed image loads show initials.
Room state lives in server memory and is removed
when everyone leaves or the server restarts.

If sign-in fails, the app displays the cause instead of joining a guest lobby.
After fixing configuration or an expired sign-in, close and reopen the Activity.

**`OAuth2 Error: invalid_request: Missing "redirect_uri" in request`** means you
should check **OAuth2 → Redirects** in the Discord Developer Portal. Add
`https://127.0.0.1`, click **Save Changes**, then close and reopen the Activity.
This portal setting is required even for an embedded Activity; the SDK handles
the redirect itself. The installed SDK's `authorize` API does not take a
`redirect_uri` argument, so this is not a missing frontend parameter or a change
to the Activity URL mapping.

**Sign-in endpoint not found (HTTP 404), or the old generic "Could not sign in
with Discord" message:** stop any old standalone Vite process and run
`npm run dev` from the project root. This starts the app and `/api` together on
port 5173. The tunnel must target that same port; an existing tunnel to 5173 can
stay running. Its `/api` URL should return `{ "status": "ok" }`. If you create a
new tunnel, update the `/` target in **Activities → URL Mappings** to its hostname
(without `https://`). Add the OAuth2 client secret to `server/.env` if needed,
restart the shared server, and reopen the Activity.

References: [Discord's Activity setup and OAuth guide](https://docs.discord.com/developers/activities/building-an-activity),
[networking and proxy requirements](https://docs.discord.com/developers/activities/development-guides/networking).

## Production

```sh
npm run build
npm start
```

Run those commands from the project root. The server serves `client/dist` and
the same `/api` endpoints on `PORT` (default 5173).
Host it behind HTTPS with WebSocket support and point Discord's `/` URL mapping
at that hostname. Use a single server instance while room state is held in memory.

## Checks

```sh
npm test
npm run lint
npm run build
imagegen/.venv/bin/python -m unittest discover -s imagegen -p 'test_*.py'
```

Tests use simulated Discord responses and real local HTTP/WebSocket connections
to cover sign-in, trusted identities, room isolation, reconnection, and gameplay.
A live Discord launch with configured credentials is still needed to confirm the
Developer Portal mapping and OAuth setup.
