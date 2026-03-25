import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireAdminPin } from "@/lib/adminPin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    requireAdminPin(req);
    return jsonNoStore({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
