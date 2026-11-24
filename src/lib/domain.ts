export type Box = { x:number; y:number; w:number; h:number };
export type Rule = {id:string; name:string; description:string; treatment:"replace"|"blur"|"warn"; weight:number; is_active?:number; sort_order?:number};
export type Finding = {id:string; photo_id:string; rule_id:string; box:Box; reason:string; confidence:number; source:"ai"|"manual"; status:"open"|"fixed"|"dismissed"};
export type PhotoStatus = "uploaded"|"detecting"|"detected"|"failed"|"edited"|"expired";
export type Photo = {id:string; batch_id:string; staff_id:string; status:PhotoStatus; original_key:string; current_key:string|null; width:number; height:number; risk_score:number|null; rules_snapshot:string; error:string|null; created_at:string; expires_at:string; edited_at:string|null};
export type Edit = {id:string; kind:string; finding_ids:string; drink:string|null; result_key:string; previous_key:string|null; previous_findings:string; reverted:number};
export function riskScore(findings:Pick<Finding,"rule_id"|"confidence"|"status">[], rules:Pick<Rule,"id"|"weight">[]) {
 const weights=new Map(rules.map(r=>[r.id,r.weight]));
 const scores=findings.filter(f=>f.status==="open").map(f=>(weights.get(f.rule_id)??0)*f.confidence*20).sort((a,b)=>b-a);
 return scores.length ? Math.min(100,Math.round(scores[0]+scores.slice(1).reduce((a,b)=>a+b,0)*0.2)):0;
}
export function riskLabel(score:number) {return score<20?"安全":score<50?"注意":score<80?"危険":"炎上";}
export function validBox(value:unknown):value is Box {
 if(!value || typeof value!=="object") return false;
 const b=value as Box;
 return [b.x,b.y,b.w,b.h].every(v=>typeof v==="number"&&Number.isFinite(v)) && b.x>=0&&b.y>=0&&b.w>0&&b.h>0&&b.x+b.w<=1.000001&&b.y+b.h<=1.000001;
}
export function sanitizeDrink(value:unknown) {
 if(typeof value!=="string") throw new Error("飲み物名を入力してください。");
 const clean=value.normalize("NFKC").replace(/[^\p{L}\p{N}ー ]/gu,"").trim();
 if(!clean||Array.from(clean).length>20) throw new Error("飲み物名は記号を除いて20字以内にしてください。");
 return clean;
}
export function canReadImage(staffId:string, uploaderId:string, version:string, hasCurrent:boolean) {
 return version==="original" ? staffId===uploaderId : version==="current" && (hasCurrent || staffId===uploaderId);
}
export function canTransition(from:PhotoStatus,to:PhotoStatus) {
 const allowed:Record<PhotoStatus,PhotoStatus[]>={uploaded:["detecting","expired"],detecting:["detected","failed","expired"],detected:["detecting","edited","expired"],failed:["detecting","edited","expired"],edited:["detecting","edited","expired"],expired:[]};
 return allowed[from].includes(to);
}
export function jstDate(date=new Date()) {return new Date(date.getTime()+9*3600000).toISOString().slice(0,10);}
const normalizeRuleName=(name:string)=>name.replace(/\s+/g,"").toLowerCase();
const clamp=(coordinate:number)=>Math.max(0,Math.min(1,coordinate));
export function parseDetection(value:unknown,rules:Rule[]) {
 if(typeof value==="string") value=JSON.parse(value.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,"$1"));
 if(!value || typeof value!=="object" || !Array.isArray((value as {findings:unknown}).findings)) throw new Error("判定結果の形式が不正です。");
 const items=(value as {findings:unknown[]}).findings;
 if(items.length>100) throw new Error("判定件数が多すぎます。");
 const result:Omit<Finding,"id"|"photo_id">[]=[];
 for(const item of items) {
  if(!item || typeof item!=="object") throw new Error("判定項目が不正です。");
  const f=item as {rule_name:unknown;box:unknown;reason:unknown;confidence:unknown};
  if(typeof f.rule_name!=="string") continue;
  const name=normalizeRuleName(f.rule_name);
  const rule=rules.find(r=>r.name===f.rule_name)??rules.find(r=>normalizeRuleName(r.name)===name);
  if(!rule) continue;
  const raw=f.box as Box|null;
  if(!raw||![raw.x,raw.y,raw.w,raw.h].every(Number.isFinite)||typeof f.reason!=="string"||!f.reason.trim()||Array.from(f.reason).length>30||typeof f.confidence!=="number"||!Number.isFinite(f.confidence)||f.confidence<0||f.confidence>1) throw new Error("判定項目の値が不正です。");
  const x=clamp(raw.x),y=clamp(raw.y);
  const box={x,y,w:Math.min(clamp(raw.w),1-x),h:Math.min(clamp(raw.h),1-y)};
  if(box.w===0||box.h===0) continue;
  result.push({rule_id:rule.id,box,reason:f.reason,confidence:f.confidence,source:"ai",status:"open"});
 }
 return result;
}
export const DRINKS=["オレンジジュース","リンゴジュース","ぶどうジュース","ラムネ","麦茶","おまかせ"];
export const NOTICE="判定は見落としを減らす補助です。最終判断は人が行ってください。「問題なし」でも公開の責任は広報にあります。";
export const COLORS=["#ea580c","#a855f7","#2563eb","#059669","#e11d48"];
