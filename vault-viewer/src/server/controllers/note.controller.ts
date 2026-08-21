import { extname, resolve } from "node:path";
import type { Request, Response } from "express";
import { parseNote } from "../../../server/parser.js";
import { fileQuerySchema, noteQuerySchema } from "../validators/note.schema.js";
import { ForbiddenError, NotFoundError } from "../errors/appError.js";
import { computeBacklinks } from "../services/vault.pure.js";
import { assertInside, isSafeRelPath } from "../utils/path.js";
import type { ControllerDeps } from "./deps.js";

const MAX_BACKLINKS = 20;

/** GET /api/note — one parsed note with backlinks and outgoing links. */
export function getNote(deps: ControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { workspace, path: relPath } = noteQuerySchema.parse(req.query);
    if (!isSafeRelPath(relPath)) {
      throw new ForbiddenError("invalid path");
    }
    const ws = await deps.scope.resolve(workspace);
    if (!ws) throw new NotFoundError("workspace");

    const found = await deps.vaultService.resolveVaultFile(ws, relPath);
    if (!found) throw new NotFoundError(`note ${relPath}`);
    assertInsideAny(ws, found.absPath);

    const text = await deps.vaultService.readFileText(found.absPath);
    const fallback = relPath.split("/").pop()?.replace(".md", "") ?? relPath;
    const parsed = parseNote(text, fallback);

    const notes = await deps.vaultCache.get(ws.kb, ws.exclude);
    const backlinks = computeBacklinks(notes, relPath, parsed.title, fallback).slice(
      0,
      MAX_BACKLINKS,
    );

    res.json({
      relPath,
      ...parsed,
      backlinks,
      outgoing: parsed.rels,
      isWorklog: found.isWorklog,
    });
  };
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
} as const;

/** GET /api/file — static asset streaming for vault-relative images/docs. */
export function getFile(deps: ControllerDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { workspace, path: relPath } = fileQuerySchema.parse(req.query);
    if (!isSafeRelPath(relPath)) {
      throw new ForbiddenError("invalid path");
    }
    const ws = await deps.scope.resolve(workspace);
    if (!ws) throw new NotFoundError("workspace");

    const found = await deps.vaultService.resolveVaultFile(ws, relPath);
    if (!found) throw new NotFoundError(`file ${relPath}`);
    const resolved = resolve(found.absPath);
    assertInsideAny(ws, resolved);

    const mime = mimeFor(extname(resolved).toLowerCase());
    res.setHeader("Content-Type", mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");

    try {
      const st = await deps.vaultService.statMtime(resolved);
      // Weak ETag from mtime+size; radix-36 keeps the header short.
      res.setHeader("ETag", `W/"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`);
    } catch {
      // ETag is best-effort
    }

    res.sendFile(resolved);
  };
}

/** The resolved file must live inside kb or worklogs — one of the two roots. */
function assertInsideAny(ws: { kb: string; worklogs: string }, absPath: string): void {
  try {
    assertInside(ws.kb, absPath);
    return;
  } catch {
    // fall through to worklogs
  }
  assertInside(ws.worklogs, absPath);
}

function mimeFor(ext: string): string {
  switch (ext) {
    case ".png": return MIME_BY_EXT[".png"];
    case ".jpg": return MIME_BY_EXT[".jpg"];
    case ".jpeg": return MIME_BY_EXT[".jpeg"];
    case ".gif": return MIME_BY_EXT[".gif"];
    case ".svg": return MIME_BY_EXT[".svg"];
    case ".webp": return MIME_BY_EXT[".webp"];
    case ".pdf": return MIME_BY_EXT[".pdf"];
    default: return "application/octet-stream";
  }
}
