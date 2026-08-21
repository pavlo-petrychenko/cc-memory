import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { ValidationError } from "../errors/appError.js";

type Where = "query" | "body" | "params";

export function validate(schema: z.ZodSchema, where: Where = "query") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const source = (req as unknown as Record<string, unknown>)[where];
    const result = schema.safeParse(source);
    if (!result.success) {
      next(new ValidationError("validation failed", result.error.flatten()));
      return;
    }
    // req.query is a getter in Express 5 — use defineProperty to replace
    try {
      Object.defineProperty(req, where, {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } catch {
      // fallback: mutate in place
      const target = source as Record<string, unknown>;
      for (const k of Object.keys(target)) delete target[k];
      Object.assign(target, result.data as Record<string, unknown>);
    }
    next();
  };
}
