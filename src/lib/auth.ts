import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff, sessions } from "@/db/schema";
import { canUseDevLogin, roleStatus, safeReturnTo, SESSION_COOKIE, sessionIsValid, verifySession } from "./session";
import { apiError } from "./errors";

export async function authEnvironment() {
  const { env } = await getCloudflareContext({ async: true });
  return {
    secret: env.SESSION_SECRET ?? process.env.SESSION_SECRET ?? "",
    devLogin: canUseDevLogin(process.env.NODE_ENV, process.env.APP_ENV ?? env.APP_ENV, process.env.DEV_LOGIN ?? env.DEV_LOGIN),
  };
}
export async function getCurrentStaff() {
  const id = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, (await authEnvironment()).secret);
  if (!id) return null;
  const db = await getDb();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!sessionIsValid(session)) return null;
  const member = await db.query.staff.findFirst({ where: eq(staff.id, session!.staff_id) });
  return member?.is_active ? member : null;
}
export async function requireStaff(returnTo = "/") {
  const member = await getCurrentStaff();
  if (!member) redirect(`/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return member;
}
export async function guardRole(role: "staff" | "lead") {
  const member = await getCurrentStaff();
  const status = roleStatus(member, role);
  return status === 200 ? { member: member!, error: null } : {
    member: null,
    error: apiError(status, status === 401 ? "unauthorized" : "forbidden", status === 401 ? "ログインしてください。" : "責任者の権限が必要です。"),
  };
}
