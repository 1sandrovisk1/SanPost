import { NextFunction, Request, Response, json } from 'express';
import type { RawBodyRequest } from '@nestjs/common';

const parser = json({
  limit: '1mb',
  inflate: false,
  verify: (req, _res, bytes) => {
    (req as RawBodyRequest<Request>).rawBody = bytes;
  },
});

// The named wrapper is intentional: ExpressAdapter detects a global jsonParser
// by its function name. Registering the scoped parser directly would disable
// Nest's default JSON parser on unrelated routes.
export function facebookAutomationBodyParser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  parser(req, res, next);
}
