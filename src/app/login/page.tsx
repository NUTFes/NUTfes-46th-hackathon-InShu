import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authEnvironment } from "@/lib/auth";
export const dynamic="force-dynamic";
export default async function Login() {
 const dev=(await authEnvironment()).devLogin;
 const members=dev?await (await getDb()).select().from(staff).where(eq(staff.is_active,true)):[];
 return <section className="panel"><p className="muted">広報写真を、公開する前に。</p><h1>隠酒へようこそ</h1><p>写り込みを確認して、公開できる一枚に整えましょう。</p><a className="button" href="/api/auth/slack/login">Slack でログイン（準備中）</a>{dev&&<><h2>開発用ユーザー切替</h2><p>架空の広報担当でローカル動作を確認できます。</p><form action="/api/auth/dev-login" method="post"><label>広報担当<select name="staff_id">{members.map(m=><option key={m.id} value={m.id}>{m.display_name}{m.is_lead?"（責任者）":""}</option>)}</select></label><button>開発ログイン</button></form></>}</section>;
}
