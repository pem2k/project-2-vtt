# Architecture diagrams

These diagrams show how the oPeN VTT browser app, the backend, and Supabase fit together. GitHub draws them from the text below. For versions and the list of UI components, see [architecture.md](agent/architecture.md).

The design follows one rule: **Supabase holds anything that must persist, and Socket.IO only announces changes.** Security is enforced in the database (row-level security) and in the backend's checks on each socket event, never only in the browser.

## System overview

```mermaid
flowchart LR
  subgraph Browser["Browser: React single-page app"]
    UI["Pages and panels<br/>Login, Host or Join, Game"]
    Board["Konva board<br/>map, grid, tokens"]
    SBC["Supabase client<br/>lib/supabaseClient.js"]
    SKC["Socket.IO client<br/>lib/socket.js"]
    UI --> Board
    UI --> SBC
    UI --> SKC
  end

  subgraph Backend["Backend: Express and Socket.IO, port 3000"]
    Handshake["Handshake check<br/>validates the Supabase token"]
    Handlers["Event handlers<br/>room, token, dice, character"]
    Handshake --> Handlers
  end

  subgraph Supabase["Supabase"]
    Auth["Auth<br/>accounts and sessions"]
    API["Data API<br/>tables and RPC functions<br/>row-level security"]
    DB[("PostgreSQL")]
    Storage["Storage<br/>maps bucket"]
    API --> DB
  end

  SBC -->|"sign up, log in"| Auth
  SBC -->|"queries and RPCs"| API
  SBC -->|"map uploads"| Storage
  SKC -->|"events, sent with the access token"| Handshake
  Handshake -->|"validate token"| Auth
  Handlers -->|"re-read rows with the caller's token"| API
  Handlers -.->|"announce changes to the room"| SKC
```

How to read it:

- The browser talks to Supabase directly for sign-in, saving data, and map uploads. There are no REST routes in the backend.
- The backend only runs Socket.IO. It checks who is connecting, checks they belong to the room, reads the row back from Supabase with the caller's own token (so row-level security still applies), and then tells everyone in the room.
- The dashed line is the broadcast back to the browsers in the room.

## Who is responsible for what

| Concern                                | Where it happens                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Accounts and sessions                  | Supabase Auth                                                                  |
| Saving rooms, tokens, characters, maps | Supabase tables, written from the browser through the Supabase client          |
| Who may do what                        | Row-level security policies and RPC functions in `backend/supabase/migrations` |
| Map image files                        | Supabase Storage, `maps` bucket, one folder per room                           |
| Live updates in a room                 | Socket.IO events in `backend/src/sockets`                                      |
| Rolling dice                           | The backend. The server rolls, so a client cannot choose its result            |
| UI-only state                          | React state in the browser, such as panel positions and the camera             |

## Joining a room

```mermaid
sequenceDiagram
  actor Player
  participant Browser
  participant Supabase
  participant Backend

  Player->>Browser: Enter room name and password
  Browser->>Supabase: rpc join_room(name, password)
  Supabase-->>Browser: room id, and a room_members row now exists
  Browser->>Backend: Connect with the access token
  Backend->>Supabase: Validate the token
  Supabase-->>Backend: User
  Browser->>Backend: joinRoom(roomId)
  Backend->>Supabase: Is this user in room_members?
  Supabase-->>Backend: Yes, with a role
  Backend-->>Browser: ack ok, socket joins the room
```

## Moving a token

This is the pattern every live update follows: save first, then announce.

```mermaid
sequenceDiagram
  actor Player
  participant Browser as Player's browser
  participant Supabase
  participant Backend
  participant Others as Everyone else in the room

  Player->>Browser: Drag an assigned token
  Browser->>Supabase: rpc move_token(tokenId, x, y)
  Note over Supabase: Allowed only for the DM or the assigned player
  Supabase-->>Browser: Updated token row
  Browser->>Backend: moveToken { roomId, tokenId }
  Backend->>Supabase: Read the token and the caller's role
  Note over Backend: Same permission check again, on the server
  Backend-->>Browser: ack ok
  Backend-->>Browser: tokenMoved (saved row)
  Backend-->>Others: tokenMoved (saved row)
```

The backend never trusts position data from the client. It re-reads the saved row and broadcasts that.

Character HP changes work the same way (`update_character`, then `characterUpdated`). DM token changes (`tokenAdded`, `tokenUpdated`, `tokenRemoved`) also save first and announce second, but they are sent to everyone except the DM. Dice are the exception: nothing is saved, and the server rolls and broadcasts `diceResult`. The event names and payloads live in `backend/src/sockets`.

## Data model

```mermaid
erDiagram
  AUTH_USERS ||--o{ ROOM_MEMBERS : "joins as"
  ROOMS ||--o{ ROOM_MEMBERS : "has"
  ROOMS ||--o{ TOKENS : "has"
  ROOMS ||--o{ CHARACTERS : "has"
  ROOMS ||--o{ MAPS : "has"
  ROOMS }o--o| MAPS : "active map"
  AUTH_USERS ||--o{ CHARACTERS : "owns"
  AUTH_USERS |o--o{ TOKENS : "assigned to"

  ROOMS {
    uuid id PK
    text name
    text password_hash
    uuid created_by FK
    uuid active_map_id FK
  }
  ROOM_MEMBERS {
    uuid room_id FK
    uuid user_id FK
    text role "dm or player"
  }
  TOKENS {
    uuid id PK
    uuid room_id FK
    text name
    text color
    float x
    float y
    uuid assigned_to FK
  }
  CHARACTERS {
    uuid id PK
    uuid room_id FK
    uuid user_id FK
    text name
    int hp
    int max_hp
    int ac
    text notes
  }
  MAPS {
    uuid id PK
    uuid room_id FK
    text name
    text url
  }
```

A user's role belongs to the room, not to the account, so the same person can be the DM of one room and a player in another. Deleting a room removes its members, tokens, characters, and maps. The policies behind this model are in `backend/supabase/migrations`.
