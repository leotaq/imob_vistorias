import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { resolveAuthActor } from "@/lib/authActor";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const resolved = await resolveAuthActor(req);
    return jsonNoStore(resolved);
  } catch (err) {
    return apiError(err);
  }
}
