---
type: spec
importance: 7
tags: [auth, oauth]
epic: auth-system
---
# OAuth Flow

Handles the OAuth 2.0 authorization code flow with PKCE.

Depends on [[jwt]] for token issuance.

Steps:
1. Redirect to provider
2. Exchange code for tokens
3. Store via [[jwt]]

> [!WARNING] PKCE required
> Always use S256 challenge method.

#oauth #auth
