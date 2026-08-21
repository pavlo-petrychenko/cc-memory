import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, _res: Response, next: NextFunction): void {
  const existing = req.headers["x-request-id"];
  const id =
    typeof existing === "string" && existing.length > 0
      ? existing
      : Math.random().toString(36).slice(2, 10);
  (req as unknown as { id: string }).id = id;
  next();
}
