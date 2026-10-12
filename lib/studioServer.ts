// Server-side routes for PGL Studio, written against the Web Request/Response API so the
// same code runs in the local Node server (server.ts) and as a Vercel Function (api/index.ts).
import { GoogleGenAI } from "@google/genai";

export interface StudioEnv {
  PGL_BACKEND_URL?: string;
  PGL_STUDIO_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

// Paths owned by the Genome Ledger backend. Everything else is served by Studio.
const LEDGER_PREFIXES = ["/api/v1/"];
const LEDGER_PATHS = ["/health", "/.well-known/pgl-signing-key", "/.well-known/x402.json"];

// vercel.json rewrites pass the original path here, so the function sees the same path
// the browser asked for whether or not the platform rewrites request.url.
export const ORIGINAL_PATH_PARAM = "__path";

// Hop-by-hop headers are connection-specific and must not be forwarded.
const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer", "proxy-authorization", "proxy-authenticate", "host", "content-length"];

export function isLedgerPath(pathname: string) {
  return (
    LEDGER_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    LEDGER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

function resolveTarget(request: Request) {
  const url = new URL(request.url);
  const pathname = url.searchParams.get(ORIGINAL_PATH_PARAM) || url.pathname;
  url.searchParams.delete(ORIGINAL_PATH_PARAM);
  return { pathname, search: url.search };
}

// Forwards a request to Genome Ledger. When PGL_STUDIO_API_KEY is set it replaces any
// client-supplied key, so the key never ships in the browser bundle.
export async function proxyToLedger(request: Request, pathname: string, search: string, env: StudioEnv) {
  const backendUrl = (env.PGL_BACKEND_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  const headers = new Headers(request.headers);
  HOP_BY_HOP.forEach((name) => headers.delete(name));
  const studioApiKey = env.PGL_STUDIO_API_KEY?.trim();
  if (studioApiKey) {
    headers.set("x-api-key", studioApiKey);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const upstream = await fetch(`${backendUrl}${pathname}${search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual"
    });
    const responseHeaders = new Headers(upstream.headers);
    // fetch has already decoded the body; the original encoding and length no longer apply.
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error(`Genome Ledger backend unreachable at ${backendUrl}:`, error instanceof Error ? error.message : error);
    return Response.json({ detail: "Genome Ledger backend is unreachable" }, { status: 502 });
  }
}

let aiClient: GoogleGenAI | null = null;
function getAi(env: StudioEnv): GoogleGenAI {
  if (!aiClient) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is required to prompt Gemini");
    }
    aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return aiClient;
}

async function handleChat(request: Request, env: StudioEnv) {
  try {
    const { messages, systemInstruction, model } = await request.json();
    const ai = getAi(env);
    const chatModel = model || "gemini-2.5-flash";

    // Format messages into content format for @google/genai
    const formattedContents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const config: any = {};
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (chatModel.includes("pro")) {
      // pro model config supporting high thinking
      config.thinkingConfig = { thinkingBudget: 2048 };
    }

    const response = await ai.models.generateContent({
      model: chatModel,
      contents: formattedContents,
      config: Object.keys(config).length > 0 ? config : undefined
    });
    return Response.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API error in /api/chat:", error);
    return Response.json({ error: error.message || "Failed to generate content from Gemini" }, { status: 500 });
  }
}

// Generates a genome compliance review for a newly configured agent.
async function handleAnalyzeGenome(request: Request, env: StudioEnv) {
  try {
    const { name, genome } = await request.json();
    const ai = getAi(env);
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
    return Response.json({ report: response.text });
  } catch (error: any) {
    console.error("Compliance analyzer error:", error);
    return Response.json({ error: error.message || "Failed to analyze agent genome payload" }, { status: 500 });
  }
}

/** Handles Studio's server routes; returns null for paths that belong to the UI. */
export async function handleStudioRequest(request: Request, env: StudioEnv): Promise<Response | null> {
  const { pathname, search } = resolveTarget(request);

  if (isLedgerPath(pathname)) {
    return proxyToLedger(request, pathname, search, env);
  }
  if (pathname === "/api/health" && request.method === "GET") {
    return Response.json({ status: "ok", timestamp: new Date().toISOString() });
  }
  if (pathname === "/api/chat" && request.method === "POST") {
    return handleChat(request, env);
  }
  if (pathname === "/api/analyze-genome" && request.method === "POST") {
    return handleAnalyzeGenome(request, env);
  }
  return null;
}
