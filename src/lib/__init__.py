"""cc-memory shared library.

Imported by the `memory` CLI, the reflector, and every Claude Code hook.
Keep this dependency-free (stdlib only) so hooks stay fast and never fail to
import. Hooks add `<repo>/src` to sys.path then `from lib import resolve, ...`.
"""
