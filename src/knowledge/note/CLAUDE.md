# note/

Parses a vault note's text into structured data: frontmatter (YAML, with a
tolerant `key: value` fallback for malformed blocks), title, tags, typed and
plain-wikilink relations, and importance. Also parses a feature's index note
(title/description/epic) separately, since it reads a note's body shape
differently from a general note.

All parsing is pure — text in, typed data out. Callers supply the fallback
title (the note's filename stem); this module has no notion of paths.
