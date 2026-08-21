import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/appError.js";

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ status: "error", code: "NOT_FOUND", message: "not found" });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as unknown as { id?: string }).id;

  if (err instanceof AppError) {
    const payload: Record<string, unknown> = {
      status: "error",
      code: err.code,
      message: err.message,
    };
    if (
      "details" in err &&
      (err as unknown as { details: unknown }).details !== undefined
    ) {
      payload.errors = (err as unknown as { details: unknown }).details;
    }
    if (requestId) payload.requestId = requestId;
    res.status(err.statusCode).json(payload);
    return;
  }

  // eslint-disable-next-line no-console
  console.error("[unhandled]", {
    path: req.path,
    requestId,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    message: "something went wrong",
    ...(requestId ? { requestId } : {}),
  });
}
