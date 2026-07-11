import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
  app.use("/api", rateLimitingMiddleware);

  // NOTE: the local mock billing endpoint that used to live here was removed.
  // Billing now comes from the real gnomledger backend via pglService.ts
  // (client-side call, aggregated from real /billing/usage rows). This dev
  // server no longer needs to fake it.

  // Initialize Gemini client lazily
  let aiClient: GoogleGenAI | null = null;
  function getAi(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required to prompt Gemini");
      }
      aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
  }

  // API router for Gemini requests
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, systemInstruction, model } = req.body;
      const ai = getAi();
      const chatModel = model || "gemini-2.5-flash";

      // Format messages into content format for @google/genai
      const formattedContents = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      // Set up the request options
      const isProModel = chatModel.includes("pro");
      const config: any = {};
      
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      
      if (isProModel) {
        // pro model config supporting high thinking
        config.thinkingConfig = {
          thinkingBudget: 2048,
        };
      }

      const response = await ai.models.generateContent({
        model: chatModel,
        contents: formattedContents,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API error in /api/chat:", error);
      res.status(500).json({ error: error.message || "Failed to generate content from Gemini" });
    }
  });

  // API Router to generate standard genome compliance reviews or audit reports dynamically
  app.post("/api/analyze-genome", async (req, res) => {
    try {
      const { name, genome } = req.body;
      const ai = getAi();
      const prompt = `You are the Compliance Notary Custodian AI for the Project Genome Ledger platform.
Review the following newly generated AI Agent parameters and genome configuration. Provide a highly professional, dense, and objective compliance report (maximum 180 words) in Markdown.
The report must include:
1. SECURITY SCORE (A, B, C, D, or F) as a prominent badge.
2. DETECTED RISK VECTORS (evaluate safety rules, model choices, and platform permissions).
3. KEY RECOMMENDATIONS for deployment into VEKLM or target environments.

Agent Name: "${name}"
Genome Payload:
${JSON.stringify(genome, null, 2)}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });

      res.json({ report: response.text });
    } catch (error: any) {
      console.error("Compliance analyzer error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze agent genome payload" });
    }
  });

  // Simple health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

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
