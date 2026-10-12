import express from "express";
import path from "path";
import { Readable } from "stream";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { handleStudioRequest, isLedgerPath } from "./lib/studioServer";

dotenv.config();

// Runs Studio's server routes (lib/studioServer.ts, shared with the Vercel Function in
// api/index.ts) inside Express. Mounted before any body parser so request bodies pass
// through untouched.
const studioRoutes: express.RequestHandler = async (req, res, next) => {
  try {
    const url = `${req.protocol}://${req.get("host") || "localhost"}${req.originalUrl}`;
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      // Required by Node's fetch implementation for streamed request bodies.
      ...(hasBody ? { duplex: "half" } : {})
    } as RequestInit);

    const response = await handleStudioRequest(request, process.env);
    if (!response) {
      return next();
    }
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    if (response.body) {
      Readable.fromWeb(response.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    next(error);
  }
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Behind a proxy or load balancer: take the client address from X-Forwarded-For.
  app.set("trust proxy", true);

  // Rate Limiter bucket container
  interface RateLimitBucket {
    count: number;
    resetTime: number;
  }
  const rateLimitStore = new Map<string, RateLimitBucket>();
  const DEFAULT_LIMIT = 100;
  const WINDOW_MS = 60 * 1000; // 1 minute

  // Tier limit lookup mapping
  const TIER_LIMITS: Record<string, number> = {
    launch: 100,
    scale: 1000,
    enterprise: 10000
  };

  // FastAPI compliant Rate Limiting Middleware
  const rateLimitingMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // API key extraction (header, query, or client IP)
    const apiKeyRaw = req.headers["x-api-key"] || req.query.apiKey;
    const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw : (req.ip || "anonymous_session");

    // Tier configuration extraction to support per-tier configurations
    const tierRaw = req.headers["x-tier"] || req.query.tier;
    const tier = typeof tierRaw === "string" ? tierRaw : "launch";
    const limit = TIER_LIMITS[tier] || DEFAULT_LIMIT;

    const now = Date.now();
    let bucket = rateLimitStore.get(apiKey);

    if (!bucket || now > bucket.resetTime) {
      bucket = {
        count: 0,
        resetTime: now + WINDOW_MS
      };
    }

    bucket.count++;
    rateLimitStore.set(apiKey, bucket);

    // Standard rate limiting RFC compliant headers
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - bucket.count));
    res.setHeader("X-RateLimit-Reset", Math.round(bucket.resetTime / 1000));

    if (bucket.count > limit) {
      return res.status(429).json({
        error: "Too Many Requests",
        message: `API rate limit exceeded. You are allowed a maximum of ${limit} requests per minute on your tier '${tier}'.`
      });
    }

    next();
  };

  // Mount rate limiter middleware per API key (applies to all `/api/*`)
  app.use("/api", (req, res, next) =>
    isLedgerPath(req.originalUrl.split("?")[0]) ? next() : rateLimitingMiddleware(req, res, next)
  );

  // NOTE: the local mock billing endpoint that used to live here was removed.
  // Billing now comes from the real gnomledger backend via pglService.ts
  // (client-side call, aggregated from real /billing/usage rows). This dev
  // server no longer needs to fake it.

  app.use(studioRoutes);

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error("Failed to start server:", e);
});
