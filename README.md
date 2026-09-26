# PromptPhone

A multiplayer prompt-and-guess game for the web and Discord Activities. React/Vite
is in `client/`; the Node server in `server/` owns rooms and game state. An optional
local SDXL-Turbo service generates images; gradient placeholders are used when
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

The model downloads on the first run. Startup loads it on a dedicated worker
that also generates images one at a time. Keep this process running alongside
the game server. It listens only on `127.0.0.1:8000`; the game server authenticates
requests and serves generated PNGs through `/images/`, including Discord's
`/.proxy` route. The next guessing timer starts after all images are ready.

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
