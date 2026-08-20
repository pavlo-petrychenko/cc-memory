---
type: spec
importance: 7
tags: [auth, oauth]
epic: auth-system
---
# OAuth Flow

Implements OAuth 2.1 Authorization Code + PKCE. Linked from [[JWT Handling]].

- links_to [[JWT Handling]]
- depends_on [[Auth]]

## Steps

1. Client creates `code_verifier` and `code_challenge`
2. Redirect to `/oauth/authorize?challenge=...`
3. Exchange code for tokens

```ts
const challenge = base64url(sha256(verifier));
```

> [!TIP] PKCE
> Always use S256, never plain.

Checklist:
- [x] Code challenge validation
- [ ] Token binding
