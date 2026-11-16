import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { staff, rules } from "../src/db/schema";
const {env,dispose} = await getPlatformProxy<CloudflareEnv>({persist:{path:".wrangler/state/v3"}});
try {
 const db=drizzle(env.DB); const now=new Date().toISOString();
 for (const [i,name] of ["架空・責任者あおい","架空・担当みかん","架空・担当こはく"].entries()) {
  await db.insert(staff).values({id:`sample-staff-${i+1}`,slack_user_id:`FAKE_STAFF_${i+1}`,display_name:name,is_lead:i===0,created_at:now}).onConflictDoNothing();
 }
 const initial = [
 ["お酒","replace",5,"酒類の缶・瓶・グラス・ジョッキ・ラベル。ソフトドリンクは含めない"],
 ["タバコ","blur",5,"タバコ・電子タバコ・灰皿・喫煙中の様子"],
 ["個人情報","blur",4,"名札・学生証・ナンバープレート・読める画面やメモ"],
 ["他社のロゴ・著作物","blur",2,"協賛企業以外のロゴ、キャラクター"],
 ["危険・不適切な行為","warn",4,"立入禁止区域への立ち入り、危険な行為、不適切なジェスチャー"]
 ] as const;
 for (const [i,[name,treatment,weight,description]] of initial.entries()) await db.insert(rules).values({id:`rule-${i+1}`,name,treatment,weight,description,sort_order:i,updated_at:now}).onConflictDoNothing();
 console.log("架空の広報担当3人（責任者1人）と初期基準5件を用意しました。");
} finally {await dispose();}
