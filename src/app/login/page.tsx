import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authEnvironment } from "@/lib/auth";
import { CopySlackId } from "@/components/copy-slack-id";
import { safeReturnTo } from "@/lib/session";
import { Jug } from "@/components/brand";
export const dynamic="force-dynamic";
export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
 const params=await searchParams; const slackId=params.slack_user_id;
 const dev=(await authEnvironment()).devLogin;
 const members=dev?await (await getDb()).select().from(staff).where(eq(staff.is_active,true)):[];
 return <section className="panel login"><Jug animated/><p className="eyebrow">INSHU / PHOTO CHECK</p><h1>隠酒へようこそ</h1><p>お酒はジュースに、NG はぼかしに。<br/>広報に出す前の、ひと手間を。</p>{params.error&&<div role="alert" className="notice">{params.error==="unregistered"?<>広報担当に登録されていません。広報責任者に追加を依頼してください{slackId&&/^[UW][A-Z0-9]{2,30}$/.test(slackId)&&<CopySlackId id={slackId}/>}</>:params.error==="slack_config"?"Slack ログインの設定がありません。責任者にお問い合わせください。":"Slack ログインに失敗しました。もう一度ログインしてください。"}</div>}<a className="button" href={`/api/auth/slack/login?return_to=${encodeURIComponent(safeReturnTo(params.return_to))}`}>Slack でログイン</a>{dev&&<><h2>開発用ユーザー切替</h2><p className="muted">架空の広報担当でローカル動作を確認できます。</p><form action="/api/auth/dev-login" method="post"><label>広報担当<select name="staff_id">{members.map(m=><option key={m.id} value={m.id}>{m.display_name}{m.is_lead?"（責任者）":""}</option>)}</select></label><button>開発ログイン</button></form></>}</section>;
}
