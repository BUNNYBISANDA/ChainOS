import { randomUUID } from "node:crypto";
import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

export interface RequestWithId extends Request {
  id: string;
}

/**
 * Stamps every request with an id (reuses an inbound `x-request-id` if the
 * caller/proxy already set one) so client-visible errors and server logs
 * can be correlated. Must run before AllExceptionsFilter needs `req.id`.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = req.header("x-request-id") ?? randomUUID();
    (req as RequestWithId).id = id;
    res.setHeader("x-request-id", id);
    next();
  }
}
