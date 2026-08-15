/**
 * Single source of the version string the CLI reports. Kept in sync with
 * package.json by a test rather than read from it at runtime, so the bundled
 * `dist/memory.js` has no filesystem dependency just to print a version.
 */
export const CC_MEMORY_VERSION = "0.1.0";
