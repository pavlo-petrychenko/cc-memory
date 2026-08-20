---
type: spec
importance: 8
tags: [auth, jwt, api]
epic: auth-system
---
# JWT Handling

> Handles validation, expiry, and rotation of JSON Web Tokens for the auth layer.

Validates `Authorization: Bearer <token>` and checks `exp` against clock skew ±5s. On expiry, trigger [[oauth|OAuth flow]] silently.

- depends_on [[oauth]]
- links_to [[auth]]

> [!NOTE] Token rotation
> Refresh tokens rotate on every use. Keep the old token for 10s to handle races.

```js
const payload = verify(token, SECRET);
if (payload.exp < now) throw "expired";
```

Related assets: ![diagram](./assets/diagram.png) — also see ![[oauth]] for sequence.

## Validation

Checks signature and `exp`.

## Rotation

Sliding window with 10s overlap.

## Errors

Returns 401 with `WWW-Authenticate`.

Tags: #jwt #auth
