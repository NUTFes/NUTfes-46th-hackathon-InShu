import { describe,it,expect } from "vitest";
import { riskScore,riskLabel,validBox,sanitizeDrink,canReadImage,canTransition,parseDetection,jstDate,type Rule,type PhotoStatus } from "../src/lib/domain";
import { signSession,verifySession,canUseDevLogin,roleStatus,sessionIsValid } from "../src/lib/session";
const rules:Rule[]=[{id:"alcohol",name:"お酒",description:"酒類",weight:5,treatment:"replace"},{id:"pii",name:"個人情報",description:"名札",weight:4,treatment:"blur"}];
const finding=(rule_id:string,confidence:number,status:"open"|"fixed"|"dismissed"="open")=>({rule_id,confidence,status});
const entry={rule_name:"お酒",box:{x:0.1,y:0.2,w:0.2,h:0.3},reason:"右奥にビール缶",confidence:0.9};
describe("炎上リスク",()=>{
 it("最大値に残りの20%を加え、整数に丸める",()=>expect(riskScore([finding("alcohol",0.8),finding("pii",0.5)],rules)).toBe(88));
 it("100で頭打ち",()=>expect(riskScore([finding("alcohol",1),finding("pii",1)],rules)).toBe(100));
 it("修正済み・誤検出を除外",()=>expect(riskScore([finding("alcohol",1,"fixed"),finding("pii",1,"dismissed")],rules)).toBe(0));
 it("加工で下がり、復元で戻る",()=>{expect(riskScore([finding("alcohol",0.9)],rules)).toBe(90);expect(riskScore([finding("alcohol",0.9,"fixed")],rules)).toBe(0);});
 it.each([[0,"安全"],[19,"安全"],[20,"注意"],[49,"注意"],[50,"危険"],[79,"危険"],[80,"炎上"],[100,"炎上"]])("%sのラベル",(score,label)=>expect(riskLabel(Number(score))).toBe(label));
});
describe("Gemini JSON の検証",()=>{
 it("基準IDに変換する",()=>expect(parseDetection(JSON.stringify({findings:[entry]}),rules)[0]).toMatchObject({rule_id:"alcohol",status:"open",source:"ai"}));
 it("不明な基準を捨てる",()=>expect(parseDetection({findings:[{...entry,rule_name:"未登録"}]},rules)).toEqual([]));
 it.each([null,{},"bad",{findings:[{...entry,confidence:1.1}]},{findings:[{...entry,confidence:-1}]},{findings:[{...entry,reason:"あ".repeat(31)}]},{findings:[{...entry,box:{x:NaN,y:0,w:1,h:1}}]}])("不正値を拒否する %j",value=>expect(()=>parseDetection(value,rules)).toThrow());
 it("コードフェンスと基準名の大文字小文字・空白を許容し、枠を画像内に収める",()=>{
  const input={findings:[{...entry,rule_name:"  aL CoHOL ",box:{x:-0.1,y:0.75,w:1.1,h:0.5}}]};
  const wrapped="```JSON\n"+JSON.stringify(input)+"\n```";
  expect(parseDetection(wrapped,[{...rules[0],name:"Alcohol"}])[0]).toMatchObject({rule_id:"alcohol",box:{x:0,y:0.75,w:1,h:0.25}});
 });
 it("空の判定は有効",()=>expect(parseDetection({findings:[]},rules)).toEqual([]));
});
describe("飲み物名",()=>{
 it("改行・記号・指示の区切りを除く",()=>expect(sanitizeDrink("  麦茶\n<script>!  ")).toBe("麦茶script"));
 it("全角英数字を正規化",()=>expect(sanitizeDrink("ＡＢＣ茶")).toBe("ABC茶"));
 it("20字は許可",()=>expect(sanitizeDrink("あ".repeat(20))).toHaveLength(20));
 it.each(["",null,"!\n","あ".repeat(21)])("空や21字以上を拒否 %j",value=>expect(()=>sanitizeDrink(value)).toThrow());
});
describe("画像アクセス",()=>{
 it("元画像は本人のみ",()=>{expect(canReadImage("a","a","original",false)).toBe(true);expect(canReadImage("b","a","original",true)).toBe(false);});
 it("加工画像は全担当",()=>expect(canReadImage("b","a","current",true)).toBe(true));
 it("加工前の current 経由で元画像を漏らさない",()=>expect(canReadImage("b","a","current",false)).toBe(false));
 it("本人は未加工 current を読める",()=>expect(canReadImage("a","a","current",false)).toBe(true));
 it("不明なバージョンを拒否",()=>expect(canReadImage("a","a","invalid",true)).toBe(false));
});
describe("状態遷移",()=>{
 it.each([["uploaded","detecting"],["detecting","detected"],["detecting","failed"],["failed","detecting"],["failed","edited"],["detected","edited"],["edited","edited"]])("%s→%s",(a,b)=>expect(canTransition(a as PhotoStatus,b as PhotoStatus)).toBe(true));
 it.each([["uploaded","edited"],["detecting","detecting"],["expired","detecting"]])("不正な%s→%s",(a,b)=>expect(canTransition(a as PhotoStatus,b as PhotoStatus)).toBe(false));
 it("JSTの日付を使う",()=>expect(jstDate(new Date("2026-11-16T15:00:00Z"))).toBe("2026-11-17"));
 it("ゼロ面積の枠を拒否",()=>expect(validBox({x:0,y:0,w:0,h:1})).toBe(false));
});
describe("署名付きセッション",()=>{
 const secret="local-test-secret-more-than-32-characters",id="00000000-0000-4000-8000-000000000001";
 it("改ざんと別の秘密を拒否",async()=>{const value=await signSession(id,secret);expect(await verifySession(value,secret)).toBe(id);expect(await verifySession(value+"a",secret)).toBeNull();expect(await verifySession(value,secret+"x")).toBeNull();});
 it("期限切れを拒否",()=>expect(sessionIsValid({expires_at:"2020-01-01T00:00:00Z"})).toBe(false));
 it("本番では開発ログインを拒否",()=>{expect(canUseDevLogin("production","local","1")).toBe(false);expect(canUseDevLogin("development","local","1")).toBe(true);});
 it("責任者を区別",()=>{expect(roleStatus(null,"staff")).toBe(401);expect(roleStatus({is_lead:false},"lead")).toBe(403);expect(roleStatus({is_lead:true},"lead")).toBe(200);});
});
