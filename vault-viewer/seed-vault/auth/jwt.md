---
type: spec
importance: 8
tags: [auth, jwt, api]
epic: auth-system
---

# JWT Handling

Validates `Authorization: Bearer <token>` and checks `exp` against clock skew ±5s. On expiry, trigger [[OAuth Flow]] silently.

> [!NOTE] Token rotation
> Refresh tokens rotate on every use. Keep the old token for 10s to handle races. See [[OAuth Flow]] for sequence.

Related index: [[auth]]

```js
const payload = verify(token, SECRET);
if (payload.exp < now) throw "expired";
```

- depends_on [[OAuth Flow]]
- links_to [[auth]]

![diagram](./assets/diagram.png)

## Validation

Check signature and audience.

## Rotation

Rotate refresh every call.

## Errors

Throw `expired` for UI re-auth.

#auth #jwt
