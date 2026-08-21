import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { ValidationError } from "../errors/appError.js";

type Where = "query" | "body" | "params";

export function validate(schema: z.ZodSchema, where: Where = "query") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[where]);
    if (!result.success) {
      next(new ValidationError("validation failed", result.error.flatten()));
      return;
    }
    (req as unknown as Record<string, unknown>)[where] = result.data;
    next();
  };
}
