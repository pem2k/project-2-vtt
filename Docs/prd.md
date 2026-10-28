# PRD — oPeN VTT

## Problem Description

Playing tabletop role playing games online requires players to share a map, track character information, move tokens, and roll dice together. When these activities are spread across separate tools, players may need to switch between windows or ask for updates about positions, health, and dice results. Dungeon Masters also need a way to prepare encounters and control which tokens each player can move. Most solutions involve self-hosting and paid software.

oPeN VTT addresses this problem by bringing these activities into one shared virtual tabletop. Dungeon Masters can create password-protected rooms, upload a map, and place named, colored tokens on a grid. Players can join using a room code, move their assigned tokens, update their character's health, and roll dice publicly. The initial prototype will focus on a shared encounter board, basic character cards, and real-time updates.

## Target Users

**Dungeon Master (DM)** — The room owner. Creates and configures the game session. Uploads maps, places and assigns tokens, controls all tokens, and edits any character card. Responsible for encounter setup and managing the flow of play.

**Player** — Joins an existing room via code + password. Moves only their assigned token. Edits their own character's HP and notes. Rolls dice publicly. Cannot access DM controls or other players' character data.

## Solution

The app is a browser-based virtual tabletop with two main views:

- **Lobby (HostJoinPage)** — After login, the DM can create a new room (name + password) and receive a shareable room code. Players enter a room code and password to join.
- **Game (GamePage)** — A shared Konva canvas displays the uploaded map with a square grid overlay. Tokens sit on the grid and are color-coded and labeled. A side panel shows the player's character card (name, HP, AC, notes) and a dice roller. The DM gets an additional controls panel for token and map management.

All changes — token positions, character updates, dice results — are broadcast in real time via Socket.IO so every player in the room sees updates immediately. Room state is persisted to Supabase so players can reconnect without losing progress.

## Priorities

### Must Have

- Create an account, log in, and log out.
- DM creates a password-protected room; players join using a room code and password.
- Upload and display maps with a square grid.
- DM adds, names, assigns, moves, and removes colored tokens.
- Players move only assigned tokens; the DM controls all tokens.
- Name, current/max HP, armor class, and notes. Players edit their own HP and notes.
- Select a die type; everyone sees the player's name and result.
- Share token positions, character changes, and dice results.
- Save room and board data; load the latest state when joining or reconnecting.
- Check room membership and editing permissions on the backend.

### Should Have

- Independent map panning and zooming.
- Adjustable grid and token snapping to that grid.
- Dice modifiers — e.g. manual rolls 2d6+6, should also come from char sheet.
- Scrollable roll history for the current session.
- Multiple maps per room — DM uploads and switches between maps via DM Controls.

### Could Have

- Uploaded token images.
- Hidden enemy tokens that the DM can reveal.
- Manual death markers.
- Private DM rolls.
- A simple manually ordered initiative list.

### Won't Have This Release

- Browsable game listings and "My Games."
- Reusable enemy template libraries.
- Full character sheets, custom items, and automated game rules.
- Distance measurement and area-of-effect drawing tools.
- Dynamic lighting and fog of war.
- D&D Beyond importing.

## User Stories

1. As a player, I want to create an account and log in so that my identity persists across sessions.
2. As a DM, I want to create a password-protected room and share the code so that only invited players can join my game.
3. As a DM, I want to upload a map and place named, colored tokens on a grid so that I can set up an encounter for my players.
4. As a player, I want to move my assigned token and see everyone else's moves in real time so that combat feels live and collaborative.
5. As a player, I want to view my character card, update my HP, and roll dice with results visible to everyone so that I can play my turn without leaving the table.

## Project Scope

To meet MVP, the application must support account creation and login, password-protected room creation and joining, single map upload with grid overlay, full token CRUD with assignment and permission enforcement, basic character cards with player-editable HP and notes, public dice rolling with visible results, real-time sync of all game state, persistence across sessions, and backend permission checks for room membership and data editing.

The app should additionally support map pan/zoom, grid snapping, dice modifiers, and roll history. It could include token images, hidden tokens, death markers, private DM rolls, and an initiative tracker — time permitting.

The app will not include game listings, template libraries, full character sheets, measurement tools, fog of war, multi-map rooms, or third-party imports.

## Tech Stack

| Part | Choice | Version |
|---|---|---|
| Runtime | Node.js (LTS) | 24.22.1 |
| Frontend | React + Vite | React 19.3.1, Vite 8.3.5 |
| Map and tokens | Konva + React Konva | react-konva 19.3.2 |
| Auth | Supabase Auth | — |
| Database | Supabase (PostgreSQL) | — |
| File storage | Supabase Storage | — |
| Realtime game events | Socket.IO | 4.8.4 |
| Backend | Express (thin — just Socket.IO) | 5.3.0 |

## Mockups

### General Flow
![General Flow Mockup](./general_mockup.png)

Pages: Landing (login) → Join a Game (Host/Join) → Room Login (code + password or room name + password) → Board (Player or DM view). Player board has a clickable character card on the left, Konva board center, dice roller bottom, and public roll history right. DM board replaces the character card with DM Controls.

### DM Controls
![DM Controls Mockup](./dm_control_mockup.png)

Four panel states within DMControls:
1. **Selected token stats** — click a token on the board to load its stats (HP, AC) and full character sheet into the panel. DM can edit all fields.
2. **Map manager** — scrollable list of saved maps with an "Upload New Map" button. Click a map to set it as active.
3. **Enemy token management** — Add Enemy Token, Remove selected token, Bulk Add (CSV, could-have).
4. **Enemy token character sheet** — fillable stats grid for enemy tokens.
