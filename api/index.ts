// Vercel Function for PGL Studio's server routes; vercel.json rewrites them here.
import { handleStudioRequest } from "../lib/studioServer.js";

export default {
  async fetch(request: Request) {
    const response = await handleStudioRequest(request, process.env);
    return response ?? Response.json({ detail: "Not Found" }, { status: 404 });
  }
};
