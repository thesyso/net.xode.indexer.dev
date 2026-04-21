import { Request, Response, NextFunction } from "express";

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function requireMasterAuth(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.MASTER_API_KEY;
  if (!expectedToken) {
    return res.status(500).json({ error: "MASTER_API_KEY is not configured" });
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: "Unauthorized master request" });
  }

  next();
}

export function requireUserAuth(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.USER_API_KEY;
  if (!expectedToken) {
    return res.status(500).json({ error: "USER_API_KEY is not configured" });
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: "Unauthorized user request" });
  }

  next();
}
