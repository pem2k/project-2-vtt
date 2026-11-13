# API reference

This document describes every interface the oPeN VTT backend exposes. There are two:

- **Socket.IO events**, served by the Express backend in `backend/src/sockets`.
- **Supabase RPCs, tables, and storage**, defined by the migrations in `backend/supabase/migrations`. The frontend calls these directly with the signed-in user's JWT, and Postgres row-level security (RLS) decides what each caller may do.

Everything here was taken from the code. If a handler or migration changes, update this file in the same pull request.

## How the two interfaces work together

Persistent changes are written to Supabase first. Socket.IO then tells the other people in the room that something changed.

1. The client writes through Supabase (an RPC or a direct table write). RLS and the RPC checks decide whether it is allowed.
2. The client emits a socket event that carries only ids, such as `{ roomId, tokenId }`.
3. The server checks that the caller belongs to the room and may do this action, re-reads the row from Supabase using the caller's own token, and broadcasts that authoritative row.

The server never trusts row data sent by a client. It always reads the row again.

## Socket.IO

### Connecting

| Item                | Value                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Server URL          | The backend `PORT` (default `3000`). The frontend reads `VITE_SOCKET_URL` and falls back to `http://localhost:3000`.              |
| Authentication      | Pass the Supabase access token in the handshake: `io(url, { auth: { accessToken } })`.                                            |
| Allowed CORS origin | The `CLIENT_ORIGIN` environment variable (comma-separated for several origins). Falls back to `http://localhost:5173` when unset. |
| Methods             | `GET`, `POST`                                                                                                                     |

The connection is refused with one of these errors:

| Error message              | Cause                                               |
| -------------------------- | --------------------------------------------------- |
| `Authentication required.` | The handshake has no `auth.accessToken`.            |
| `Invalid access token.`    | Supabase rejected the token, or it matches no user. |

After a successful handshake the server keeps the user and token on the socket, and uses that token for every later Supabase read, so RLS applies to the caller.

### Acknowledgements

Every client-to-server event accepts an optional acknowledgement callback. The server always answers in one of two shapes:

```js
{ ok: true }
{ ok: false, error: 'message' }
```

### The join step

A socket must join a room before any other event will work. Every event below except `joinRoom` first checks that the socket is in the room named in the payload, and answers `Socket is not in room.` if it is not.

### Client to server events

| Event              | Payload                                     | Who may emit                               | Result                                                           |
| ------------------ | ------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `joinRoom`         | `roomId` (a plain string, not an object)    | Any room member                            | Socket joins the room                                            |
| `rollDice`         | `{ roomId, die }` or `{ roomId, notation }` | Any socket in the room                     | `diceResult` to everyone in the room, including the roller       |
| `tokenAdded`       | `{ roomId, tokenId }`                       | DM                                         | `tokenAdded` to everyone else in the room                        |
| `tokenRemoved`     | `{ roomId, tokenId }`                       | DM                                         | `tokenRemoved` to everyone else in the room                      |
| `tokenUpdated`     | `{ roomId, tokenId }`                       | DM                                         | `tokenUpdated` to everyone else in the room                      |
| `moveToken`        | `{ roomId, tokenId }`                       | DM, or the player the token is assigned to | `tokenMoved` to everyone in the room, including the sender       |
| `characterUpdated` | `{ roomId, characterId }`                   | DM, or the character's owner               | `characterUpdated` to everyone in the room, including the sender |
| `gridUpdated` | `{ roomId }` | DM | Saved grid settings to everyone in the room, including the sender |
| `mapUpdated` | `{ roomId }` | DM | Saved active map to everyone in the room, including the sender |

#### `joinRoom`

Payload: the room id as a string.

The server looks up the caller in `room_members`. If a row exists, the socket joins the room and the server acknowledges `{ ok: true }`.

| Error                                | Cause                                        |
| ------------------------------------ | -------------------------------------------- |
| `You are not a member of this room.` | The caller has no `room_members` row.        |
| `Unable to join room.`               | Any other failure, such as a database error. |

#### `rollDice`

Payload: `{ roomId, die }` for a single die, or `{ roomId, notation }` for dice notation. If `notation` is present it is used and `die` is ignored.

- `die` must be one of `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`.
- `notation` has the form `[count]d<sides>[+|-modifier]`, for example `d20`, `2d6+6`, or `3d8 - 1`. Spaces around the sign are allowed. `count` defaults to 1 and must be from 1 to 100. `sides` must be one of the dice above.

The server rolls the dice itself, then broadcasts `diceResult`. The roll is never taken from the client.

| Error                    | Cause                                                 |
| ------------------------ | ----------------------------------------------------- |
| `Invalid payload.`       | `roomId` is missing or blank.                         |
| `Socket is not in room.` | The socket has not joined that room.                  |
| `Invalid dice notation.` | `notation` is blank, not a string, or does not parse. |
| `Invalid die.`           | `die` is not one of the allowed values.               |
| `Unable to roll dice.`   | Unexpected failure while rolling.                     |

#### `tokenAdded`, `tokenRemoved`, `tokenUpdated`

Payload: `{ roomId, tokenId }`. These three share one code path. The DM writes to the `tokens` table first, then emits the event so the server can confirm the write and tell everyone else.

1. The payload is checked and the socket must be in the room.
2. The caller must be the room's DM.
3. The server checks the database. `tokenAdded` and `tokenUpdated` require the token row to exist. `tokenRemoved` requires it to be gone.
4. The server forwards the event to every other socket in the room. The sender is not included.

| Error                         | Cause                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| `Invalid payload.`            | `roomId` or `tokenId` is missing or blank.                     |
| `Socket is not in room.`      | The socket has not joined that room.                           |
| `Only DMs can manage tokens.` | The caller is not the room's DM, or is not a member at all.    |
| `Token not found.`            | `tokenAdded` or `tokenUpdated` and no such token in this room. |
| `Token still exists.`         | `tokenRemoved` but the row is still in the table.              |

An unexpected failure acknowledges with the underlying error message.

#### `moveToken`

Payload: `{ roomId, tokenId }`. The client saves the new position first with the `move_token` RPC. This event only announces it, and the server does not write x or y itself.

The server reads the token and allows the move if the caller is the room's DM, or if the token's `assigned_to` is the caller. It then broadcasts `tokenMoved` with the token row, to everyone in the room including the sender.

| Error                                | Cause                                          |
| ------------------------------------ | ---------------------------------------------- |
| `Invalid payload.`                   | `roomId` or `tokenId` is missing or blank.     |
| `Socket is not in room.`             | The socket has not joined that room.           |
| `You are not a member of this room.` | The caller has no `room_members` row.          |
| `Token not found.`                   | No such token in this room.                    |
| `Not authorized to move this token.` | The caller is neither the DM nor the assignee. |

#### `characterUpdated`

Payload: `{ roomId, characterId }`. The client saves the change first, using the `update_character` RPC (players) or a direct table update (DM). This event announces it.

The server reads the character and allows it if the caller is the room's DM or the character's owner (`user_id`). It then broadcasts `characterUpdated` with the full character row, to everyone in the room including the sender.

| Error                                      | Cause                                          |
| ------------------------------------------ | ---------------------------------------------- |
| `Invalid payload.`                         | `roomId` or `characterId` is missing or blank. |
| `Socket is not in room.`                   | The socket has not joined that room.           |
| `You are not a member of this room.`       | The caller has no `room_members` row.          |
| `Character not found.`                     | No such character in this room.                |
| `Not authorized to update this character.` | The caller is neither the DM nor the owner.    |

### Server to client events

| Event              | Payload                                         | Sent to                                     |
| ------------------ | ----------------------------------------------- | ------------------------------------------- |
| `diceResult`       | See below                                       | Everyone in the room                        |
| `tokenAdded`       | The full `tokens` row                           | Everyone in the room but the DM who sent it |
| `tokenUpdated`     | The full `tokens` row                           | Everyone in the room but the DM who sent it |
| `tokenRemoved`     | `{ id }`, the id of the removed token           | Everyone in the room but the DM who sent it |
| `tokenMoved`       | The full `tokens` row, with its new `x` and `y` | Everyone in the room                        |
| `characterUpdated` | The full `characters` row                       | Everyone in the room                        |
| `gridUpdated` | `{ id, grid_visible, grid_cell_size }` (`id` is the room id) | Everyone in the room |
| `mapUpdated` | `{ roomId, map }` (`map` is the active map row, or `null`) | Everyone in the room |

For `gridUpdated` and `mapUpdated`, the DM saves through `set_room_grid` or `set_active_map` first. The server checks DM membership and reads the saved settings before broadcasting; client-supplied grid or map values are ignored. Acknowledgements use `{ ok: true }` or `{ ok: false, error }`. Errors are `Invalid room.`, `Only the DM can broadcast room settings.`, or `Unable to broadcast room settings.`. Joining or reconnecting reloads these settings from the room. Uploading a map also saves it as active before notifying the room.

#### `diceResult` payload

For a single die (`{ roomId, die: 'd20' }`):

```js
{ roomId, playerName, die: 'd20', result: 14 }
```

For notation (`{ roomId, notation: '2d6+6' }`):

```js
{
  roomId,
  playerName,
  die: '2d6+6', // the canonical form of the notation
  result: 13,   // the total
  notation: '2d6+6',
  rolls: [3, 4],
  modifier: 6,
  total: 13,
}
```

`playerName` comes from the caller's account: the `username` in the user metadata, otherwise the part of the email before the `@`, otherwise `Player`.

## Supabase RPCs

All of these are called with `supabase.rpc(name, args)` by a signed-in user. They run as `security definer` with a fixed search path, and execute is granted to the `authenticated` role only. Each one raises `authentication required` when there is no signed-in user.

| RPC                | Arguments                                                                   | Returns                                   |
| ------------------ | --------------------------------------------------------------------------- | ----------------------------------------- |
| `create_room`      | `p_name text`, `p_password text`                                            | The new room's `uuid`                     |
| `join_room`        | `p_name text`, `p_password text`                                            | The room's `uuid`                         |
| `get_room_members` | `p_room_id uuid`                                                            | Rows of `user_id`, `role`, `display_name` |
| `move_token`       | `p_token_id uuid`, `p_x double precision`, `p_y double precision`           | The updated `tokens` row                  |
| `update_character` | `p_character_id uuid`, `p_hp integer` (optional), `p_notes text` (optional) | The updated `characters` row              |
| `set_active_map`   | `p_room_id uuid`, `p_map_id uuid`                                           | The updated `rooms` row                   |
| `set_room_grid` | `p_room_id uuid`, `p_grid_visible boolean`, `p_grid_cell_size integer` | One row of `id`, `grid_visible`, `grid_cell_size` |

### `create_room(p_name, p_password)`

Creates a room and makes the caller its DM. The name is trimmed. The password is hashed with bcrypt (`pgcrypto`) and the plain password is never stored. Room names are unique ignoring case and surrounding spaces.

Errors: `authentication required`, `room name already taken`.

### `join_room(p_name, p_password)`

Finds the room by name (trimmed, case-insensitive), checks the password, and adds the caller as a `player`. Joining again is harmless: an existing membership, and its role, is left alone. A null password is rejected.

Errors: `authentication required`, `room not found`, `invalid password`.

### `get_room_members(p_room_id)`

Lists the room's members, DM first, then by display name. `display_name` is the `username` from the user metadata, or the part of the email before the `@`. Emails and other account fields are never returned.

Errors: `not a member of this room`.

### `move_token(p_token_id, p_x, p_y)`

The only way a player can change a token. It changes `x` and `y` only. It is allowed for the room's DM, or for the user the token is assigned to.

Errors: `authentication required`, `token not found`, `not allowed to move this token`.

### `update_character(p_character_id, p_hp, p_notes)`

A player's way to edit their own card. Only `hp` and `notes` can change, and passing `null` for either leaves it unchanged. The caller must be a member of the room and the card's owner. The DM does not use this function: the DM edits any card in the room with a direct table update.

Errors: `authentication required`, `character not found`, `not a member of room`, `not allowed to edit this character`, `hp must be between 0 and max_hp`.

### `set_active_map(p_room_id, p_map_id)`

Sets which map the room shows. Only the room's DM may call it, and the map must belong to that room. The `rooms` table has no update policy, so this function is the only way to change `active_map_id`.

Errors: `authentication required`, `not allowed to set the active map`, `map does not belong to this room`.

### `set_room_grid(p_room_id, p_grid_visible, p_grid_cell_size)`

`set_room_grid` requires the room's DM. Visibility defaults to `true`; cell size defaults to `50` and must be a multiple of 5 between 20 and 150. Both fields are non-null. Unauthorized callers receive `only the room DM can update the grid`; invalid values fail database constraints. Direct room updates remain blocked.

### Helper functions

`is_room_member(p_room_id uuid)` and `is_room_dm(p_room_id uuid)` return a boolean for the calling user. They back the RLS policies below and are executable by `authenticated` users.

## Tables and row-level security

Row-level security is on for every table. Only signed-in users have access, and the `anon` role has none. "Member" means a row in `room_members` for that room, and "DM" means a member whose role is `dm`.

| Table          | Read                 | Insert                                                | Update                              | Delete                           |
| -------------- | -------------------- | ----------------------------------------------------- | ----------------------------------- | -------------------------------- |
| `rooms`        | Members              | `create_room` only                                    | `set_active_map` / `set_room_grid` only | The room's creator               |
| `room_members` | Members of that room | `create_room` and `join_room` only                    | None                                | The member themselves, or the DM |
| `tokens`       | Members              | DM                                                    | DM (players use `move_token`)       | DM                               |
| `characters`   | Members              | A member, for a card they own (`user_id` is their id) | DM (players use `update_character`) | DM, or the card's owner          |
| `maps`         | Members              | DM                                                    | DM                                  | DM                               |

### Columns

| Table          | Columns                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| `rooms`        | `id`, `name`, `password_hash`, `created_by`, `created_at`, `active_map_id`      |
| `room_members` | `id`, `room_id`, `user_id`, `role` (`dm` or `player`), `joined_at`              |
| `tokens`       | `id`, `room_id`, `name`, `color`, `x`, `y`, `assigned_to`, `created_at`         |
| `characters`   | `id`, `room_id`, `user_id`, `name`, `hp`, `max_hp`, `ac`, `notes`, `created_at` |
| `maps`         | `id`, `room_id`, `name`, `url`, `created_at`                                    |

Deleting a room removes its members, tokens, characters, and maps. Deleting a map sets the room's `active_map_id` to null.

### Rules enforced by the database

| Rule                                                           | Where                                  | Error                                                  |
| -------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Room names are unique, ignoring case and spaces                | Unique index                           | `room name already taken` (from `create_room`)         |
| A user joins a room at most once                               | Unique constraint                      | Duplicate key error                                    |
| A token's `assigned_to` must be a member of its room           | Trigger                                | `assignee must be a member of the room`                |
| A player has at most one character per room. DMs may have many | Trigger                                | `player <user> already has a character in room <room>` |
| A character's owner must be a member of the room               | Trigger                                | `user <user> is not a member of room <room>`           |
| `0 <= hp <= max_hp`                                            | Check constraint `characters_hp_range` | Constraint violation                                   |
| The first map uploaded to a room becomes its active map        | Trigger                                | None                                                   |

## Map storage

Map images live in the Supabase Storage bucket `maps`, in a folder named after the room id (`<room_id>/<file>`). The room id in the path is what the storage policies check.

| Action | Who                  |
| ------ | -------------------- |
| Read   | Members of that room |
| Upload | The room's DM        |
| Delete | The room's DM        |

The bucket is marked public, so a public URL returned for an uploaded map opens without signing in. The frontend accepts PNG, JPEG, and WebP files and saves the public URL in the `maps` table.

## Example flows

**Moving a token**

1. The client calls `move_token(tokenId, x, y)`. Supabase checks that the caller is the DM or the assignee, and saves the position.
2. The client emits `moveToken { roomId, tokenId }`.
3. The server repeats the permission check, reads the token, and emits `tokenMoved` with the saved row to everyone in the room.

**Rolling dice**

1. The client emits `rollDice { roomId, notation: '2d6+6' }`.
2. The server validates and rolls, and emits `diceResult` to everyone in the room, including the roller.

**Changing character HP**

1. A player calls `update_character(characterId, newHp)`. Supabase checks ownership and the HP range.
2. The client emits `characterUpdated { roomId, characterId }`.
3. The server reads the card and broadcasts it, and every client replaces its copy.
