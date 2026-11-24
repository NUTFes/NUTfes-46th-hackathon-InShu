import { checkDemoPasscode, demoLoginError, demoPasscode } from "./demo-login";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { getCurrentStaff, authEnvironment } from "./auth";
import { SESSION_COOKIE, SESSION_SECONDS, signSession, verifySession, sessionCookieOptions } from "./session";
import { HttpError, apiError, fail } from "./errors";
import { canReadImage, canTransition, jstDate, riskScore, sanitizeDrink, validBox, type Photo, type Finding, type Rule, type Edit } from "./domain";
import { detect, normalizeJpeg, replaceImage } from "./gemini";
import { handleSlackAuth } from "./slack-auth";
type RowFinding=Omit<Finding,"box"> & {box:string};
const id=()=>crypto.randomUUID(); const now=()=>new Date().toISOString();
const json=(data:unknown)=>Response.json(data,{headers:{"Cache-Control":"no-store"}});
export async function handle(request:Request, parts:string[]) {
 try {
  const {env}=await getCloudflareContext({async:true}); const db=env.DB;
  const sql=(query:string,...args:unknown[])=>db.prepare(query).bind(...args);
  const one=<T,>(query:string,...args:unknown[])=>sql(query,...args).first<T>();
  const all=async<T,>(query:string,...args:unknown[])=>(await sql(query,...args).all<T>()).results;
  const body=async()=> {try {return await request.json() as Record<string,unknown>;} catch {return fail(400,"入力形式を確認してください。");}};
  const path=parts.join("/"); const post=request.method==="POST";
  if(post&&request.headers.get("origin")!==new URL(request.url).origin) fail(403,"このリクエストは受け付けられません。","forbidden");
  if(path==="auth/slack/login"||path==="auth/slack/callback") return request.method==="GET" ? handleSlackAuth(request,env) : apiError(405,"method_not_allowed","GET を使用してください。");
  if(post&&path==="auth/dev-login") {
   const auth=await authEnvironment(), passcode=demoPasscode(env);
   if(!passcode&&!auth.devLogin) fail(404,"ページが見つかりません。","not_found");
   const fields=request.headers.get("content-type")?.includes("application/json") ? await body() : Object.fromEntries(await request.formData());
   if(passcode) {
    const status=await checkDemoPasscode(env.DB,request,passcode,fields&&typeof fields==="object"?(fields as {passcode?:unknown}).passcode:undefined);
    if(status!==200) fail(status,demoLoginError(status),status===429?"rate_limited":"invalid_passcode");
   }
   const staffId=fields.staff_id;
   if(typeof staffId!=="string") fail(400,"広報担当を選んでください。");
   const member=await one<{id:string}>("SELECT id FROM staff WHERE id=? AND is_active=1" + (passcode ? " AND slack_user_id GLOB 'FAKE_STAFF_[1-3]'" : ""),staffId);
   if(!member) fail(400,"在籍中の広報担当を選んでください。");
   if(auth.secret.length<32) fail(400,"SESSION_SECRET は32文字以上必要です。");
   const jar=await cookies(); const old=await verifySession(jar.get(SESSION_COOKIE)?.value,auth.secret);
   if(old) await sql("DELETE FROM sessions WHERE id=?",old).run();
   const sessionId=id(); await sql("INSERT INTO sessions(id,staff_id,expires_at,created_at) VALUES(?,?,?,?)",sessionId,member.id,new Date(Date.now()+SESSION_SECONDS*1000).toISOString(),now()).run();
   jar.set(SESSION_COOKIE,await signSession(sessionId,auth.secret),sessionCookieOptions());
   return new Response(null,{status:303,headers:{Location:"/","Cache-Control":"no-store"}});
  }
  if(post&&path==="auth/logout") {
   const jar=await cookies();const session=await verifySession(jar.get(SESSION_COOKIE)?.value,(await authEnvironment()).secret);
   if(session) await sql("DELETE FROM sessions WHERE id=?",session).run();
   jar.set(SESSION_COOKIE,"",{...sessionCookieOptions(),maxAge:0});return new Response(null,{status:303,headers:{Location:"/login"}});
  }
  const staff=await getCurrentStaff(); if(!staff) fail(401,"ログインしてください。","unauthorized");
  if(parts[0]==="lead"&&!staff.is_lead) fail(403,"責任者の権限が必要です。","forbidden");
  if(path==="gallery"&&!post) {
   const photos=await all<Photo & {display_name:string}>("SELECT p.*,s.display_name FROM photos p JOIN staff s ON s.id=p.staff_id WHERE p.current_key IS NOT NULL AND p.status!='expired' AND p.expires_at>? ORDER BY p.edited_at DESC",now());
   return json({photos:photos.map(p=>({id:p.id,display_name:p.display_name,expires_at:p.expires_at,is_owner:p.staff_id===staff.id,edited_at:p.edited_at}))});
  }
  if(parts[0]==="lead"&&parts[1]==="rules") {
   if(!post) return json({rules:await all<Rule>("SELECT * FROM rules ORDER BY sort_order")});
   const b=await body(), ruleId=parts[2]??id();
   if(typeof b.name!=="string"||!b.name.trim()||b.name.length>50||typeof b.description!=="string"||!b.description.trim()||b.description.length>1000||!["replace","blur","warn"].includes(String(b.treatment))||!Number.isInteger(b.weight)||Number(b.weight)<1||Number(b.weight)>5||typeof b.is_active!=="boolean") fail(400,"名前・説明・扱い・重み（1〜5）・有効を確認してください。");
   if(parts[2]&&!await one("SELECT id FROM rules WHERE id=?",ruleId)) fail(404,"基準が見つかりません。");
   if(await one("SELECT id FROM rules WHERE name=? AND id!=?",b.name.trim(),ruleId)) fail(409,"同じ名前の基準があります。");
   await sql("INSERT INTO rules(id,name,description,treatment,weight,is_active,sort_order,updated_by,updated_at) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM rules),?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,treatment=excluded.treatment,weight=excluded.weight,is_active=excluded.is_active,updated_by=excluded.updated_by,updated_at=excluded.updated_at",ruleId,b.name.trim(),b.description.trim(),b.treatment,b.weight,b.is_active?1:0,staff.id,now()).run();
   return json({id:ruleId});
  }
  if(parts[0]==="lead"&&parts[1]==="staff") {
   if(!post) return json({staff:await all("SELECT id,slack_user_id,display_name,is_lead,is_active FROM staff ORDER BY created_at,id"),pending:await all("SELECT p.* FROM pending_logins p WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.slack_user_id=p.slack_user_id) ORDER BY attempted_at DESC,slack_user_id LIMIT 20")});
   const b=await body();
   if(parts[2]) {
    if(typeof b.is_active!=="boolean"||typeof b.is_lead!=="boolean") fail(400,"在籍・責任者を確認してください。");
    if(!await one("SELECT id FROM staff WHERE id=?",parts[2])) fail(404,"担当が見つかりません。");
    // 自分の権限喪失を防ぎ、管理画面への入口を必ず残す。
    if(parts[2]===staff.id&&(!b.is_active||!b.is_lead)) fail(409,"自分自身の在籍・責任者権限は解除できません。");
    await sql("UPDATE staff SET is_active=?,is_lead=? WHERE id=?",b.is_active?1:0,b.is_lead?1:0,parts[2]).run();
    if(!b.is_active) await sql("DELETE FROM sessions WHERE staff_id=?",parts[2]).run();
    return json({ok:true});
   }
   if(typeof b.slack_user_id!=="string"||!/^[UW][A-Z0-9]{2,30}$/.test(b.slack_user_id)||typeof b.display_name!=="string"||!b.display_name.trim()||b.display_name.length>80) fail(400,"Slack ユーザーID（UまたはWから始まる英数字）と表示名を入力してください。");
   if(await one("SELECT id FROM staff WHERE slack_user_id=?",b.slack_user_id)) fail(409,"このSlackユーザーは登録済みです。");
   const staffId=id();await sql("INSERT INTO staff(id,slack_user_id,display_name,is_lead,is_active,created_at) VALUES(?,?,?,0,1,?)",staffId,b.slack_user_id,b.display_name.trim(),now()).run();await sql("DELETE FROM pending_logins WHERE slack_user_id=?",b.slack_user_id).run();return json({id:staffId});
  }
  const activeRules=()=>all<Rule>("SELECT * FROM rules WHERE is_active=1 ORDER BY sort_order");
  const findings=async(photoId:string)=>(await all<RowFinding>("SELECT * FROM findings WHERE photo_id=?",photoId)).map(f=>({...f,box:JSON.parse(f.box)} as Finding));
  const photo=async(photoId:string,owner=false)=>{
   const p=await one<Photo>("SELECT * FROM photos WHERE id=?",photoId);
   if(!p) return fail(404,"写真が見つかりません。","not_found");
   if(p.status==="expired"||p.expires_at<=now()) fail(410,"保存期限が切れています。","not_found");
   if(owner&&p.staff_id!==staff.id) fail(403,"この操作はアップロードした本人のみ利用できます。","forbidden");
   return p;
  };
  const recalculate=async(p:Photo)=>{
   const rules:Rule[]=JSON.parse(p.rules_snapshot); const score=riskScore(await findings(p.id),rules);
   await sql("UPDATE photos SET risk_score=? WHERE id=?",score,p.id).run();
  };
  const dailyLimit=Math.max(1,Number(env.REPLACE_DAILY_LIMIT)||100);
  if(path==="usage"&&!post) {const used=await one<{replace_count:number}>("SELECT replace_count FROM usage WHERE staff_id=? AND date=?",staff.id,jstDate());return json({count:used?.replace_count??0,limit:dailyLimit});}
  if(path==="rules"&&!post) return json({rules:await activeRules()});
  if(path==="batches"&&post) {
   const count=(await body()).photo_count;
   if(typeof count!=="number"||!Number.isInteger(count)||count<1||count>20) fail(400,"写真は1〜20枚で指定してください。");
   const batchId=id();await sql("INSERT INTO batches(id,staff_id,photo_count,created_at) VALUES(?,?,?,?)",batchId,staff.id,count,now()).run();return json({id:batchId});
  }
  if(parts[0]==="batches"&&parts[1]) {
   const batch=await one<{staff_id:string;photo_count:number}>("SELECT * FROM batches WHERE id=?",parts[1]);
   if(!batch) fail(404,"チェックが見つかりません。","not_found"); if(batch.staff_id!==staff.id) fail(403,"このチェックは本人のみ閲覧できます。","forbidden");
   if(parts.length===2&&!post) {
    const list=await all<Photo>("SELECT * FROM photos WHERE batch_id=? ORDER BY risk_score DESC,created_at",parts[1]);
    return json({batch,photos:await Promise.all(list.map(async p=>({...p,findings:await findings(p.id)})))});
   }
   if(parts[2]==="photos"&&post) {
    if(Number(request.headers.get("content-length"))>5*1024*1024) fail(413,"写真は5MBまでです。");
    const bytes=new Uint8Array(await request.arrayBuffer()); if(bytes.length>5*1024*1024) fail(413,"写真は5MBまでです。");
    let image;try {image=normalizeJpeg(bytes);}catch {return fail(400,"長辺2048px以内の正しい JPEG を送信してください。");}
    const photoId=id(),key=`photos/${photoId}/original.jpg`,created=now();
    await env.PHOTOS.put(key,image.bytes,{httpMetadata:{contentType:"image/jpeg"}});
    // INSERT SELECT は単一文で枚数を確認するため、同時アップロードでも上限を超えない。
    const inserted=await sql(`INSERT INTO photos(id,batch_id,staff_id,original_key,width,height,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM photos WHERE batch_id=?) < ?`,photoId,parts[1],staff.id,key,image.width,image.height,created,new Date(Date.now()+30*86400000).toISOString(),parts[1],batch.photo_count).run();
    if(!inserted.meta.changes) {await env.PHOTOS.delete(key);fail(409,"宣言した枚数に達しています。","invalid_state_transition");}
    return json({id:photoId});
   }
  }
  if(parts[0]==="photos"&&parts[1]) {
   const action=parts[2]; const p=await photo(parts[1],post);
   if(!action&&!post) return json({photo:p,findings:await findings(p.id),rules:p.rules_snapshot==="[]"?await activeRules():JSON.parse(p.rules_snapshot),edits:await all<Edit>("SELECT * FROM edits WHERE photo_id=? ORDER BY rowid DESC",p.id),is_owner:p.staff_id===staff.id,offline:!env.GEMINI_API_KEY});
   if(action==="image"&&!post) {
    const version=new URL(request.url).searchParams.get("v")??"current";
    if(!canReadImage(staff.id,p.staff_id,version,!!p.current_key)) fail(403,"元画像はアップロードした本人のみ閲覧できます。","forbidden");
    const object=await env.PHOTOS.get(version==="original"?p.original_key:p.current_key??p.original_key);
    if(!object) fail(404,"画像が見つかりません。","not_found");
    return new Response(object.body,{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`${new URL(request.url).searchParams.has("download")?"attachment":"inline"}; filename="inshu-${p.id}.jpg"`}});
   }
   if(action==="detect"&&post) {
    if(!canTransition(p.status,"detecting")) fail(409,"現在の状態では判定できません。","invalid_state_transition");
    const lock=await sql("UPDATE photos SET status='detecting',error=NULL WHERE id=? AND status=? AND (risk_score IS NULL OR risk_score>=0)",p.id,p.status).run();
    if(!lock.meta.changes) fail(409,"別の処理が実行中です。","invalid_state_transition");
    try {
     const rules=await activeRules(); const object=await env.PHOTOS.get(p.current_key??p.original_key);if(!object) throw new Error("画像がありません。");
     const result=await detect(env,new Uint8Array(await object.arrayBuffer()),rules);
     await db.batch([sql("DELETE FROM findings WHERE photo_id=?",p.id),...result.map(f=>sql("INSERT INTO findings(id,photo_id,rule_id,box,reason,confidence,source,status) VALUES(?,?,?,?,?,?,?,?)",id(),p.id,f.rule_id,JSON.stringify(f.box),f.reason,f.confidence,f.source,f.status)),
      sql("UPDATE edits SET reverted=1 WHERE photo_id=?",p.id),
      sql("UPDATE photos SET status='detected',risk_score=?,rules_snapshot=?,detected_at=?,error=NULL WHERE id=?",riskScore(result,rules),JSON.stringify(rules),now(),p.id)]);
     return json({ok:true});
    } catch {await sql("UPDATE photos SET status='failed',error=? WHERE id=?","判定に失敗しました。再試行してください。",p.id).run();return apiError(502,"detection_failed","3回の判定に失敗しました。再試行してください。");}
   }
   if(post&&["replace","blur","revert","findings"].includes(action)) {
    if(!["detected","edited"].includes(p.status)) fail(409,"判定を完了してから加工してください。","invalid_state_transition");
    // risk_score=-1 を短時間の排他ロックに使い、画像と枠の履歴の競合を防ぐ。
    const locked=await sql("UPDATE photos SET risk_score=-1 WHERE id=? AND status=? AND risk_score>=0",p.id,p.status).run();
    if(!locked.meta.changes) fail(409,"別の加工が実行中です。","invalid_state_transition");
    let reserved=false,committed=false; const date=jstDate();
    try {
     const currentFindings=await findings(p.id);
     if(action==="findings") {
      const b=await body(); const rule=(await activeRules()).find(r=>r.id===b.rule_id);
      if(!rule||!validBox(b.box)||typeof b.reason!=="string"||!b.reason.trim()||Array.from(b.reason).length>30) fail(400,"項目・枠・理由（30字以内）を確認してください。");
      await sql("INSERT INTO findings(id,photo_id,rule_id,box,reason,confidence,source,status) VALUES(?,?,?,?,?,1,'manual','open')",id(),p.id,rule.id,JSON.stringify(b.box),b.reason).run();
      const snapshot:Rule[]=JSON.parse(p.rules_snapshot); if(!snapshot.some(r=>r.id===rule.id)) {snapshot.push(rule);p.rules_snapshot=JSON.stringify(snapshot);await sql("UPDATE photos SET rules_snapshot=? WHERE id=?",p.rules_snapshot,p.id).run();}
      return json({ok:true});
     }
     if(action==="revert") {
      const last=await one<Edit>("SELECT * FROM edits WHERE photo_id=? AND kind!='revert' AND reverted=0 ORDER BY rowid DESC LIMIT 1",p.id);
      if(!last) fail(409,"戻せる加工がありません。","invalid_state_transition");
      const previous=JSON.parse(last.previous_findings) as {id:string;status:string}[];
      await db.batch([sql("UPDATE edits SET reverted=1 WHERE id=?",last.id),...previous.map(f=>sql("UPDATE findings SET status=? WHERE id=? AND photo_id=?",f.status,f.id,p.id)),sql("UPDATE photos SET current_key=?,status=?,edited_at=? WHERE id=?",last.previous_key,last.previous_key?"edited":"detected",now(),p.id),sql("INSERT INTO edits(id,photo_id,kind,finding_ids,result_key,created_by,created_at,previous_key,previous_findings) VALUES(?,?,'revert','[]',?,?,?,?,?)",id(),p.id,last.previous_key??p.original_key,staff.id,now(),p.current_key,JSON.stringify(currentFindings.map(({id,status})=>({id,status}))))]);
      return json({ok:true});
     }
     let findingIds:unknown,drink="",bytes:Uint8Array|undefined;
     if(action==="blur") {
      const form=await request.formData();try{findingIds=JSON.parse(String(form.get("finding_ids")));}catch{fail(400,"対象の枠を選んでください。");}
      const file=form.get("image");if(!(file instanceof File)) fail(400,"加工した画像が必要です。");if(file.size>5*1024*1024) fail(413,"画像は5MBまでです。");
      let image;try{image=normalizeJpeg(new Uint8Array(await file.arrayBuffer()));}catch{ return fail(400,"加工画像の形式が不正です。");}
      if(image.width!==p.width||image.height!==p.height) fail(400,"元の画像と同じ寸法で保存してください。");bytes=image.bytes;
     } else {const b=await body();findingIds=b.finding_ids;try{drink=sanitizeDrink(b.drink);}catch(e){return fail(400,(e as Error).message);}}
     if(!Array.isArray(findingIds)||!findingIds.length||findingIds.length>100||findingIds.some(v=>typeof v!=="string")||new Set(findingIds).size!==findingIds.length) fail(400,"対象の枠を選んでください。");
     const selected=currentFindings.filter(f=>findingIds.includes(f.id)&&f.status==="open");const rules:Rule[]=JSON.parse(p.rules_snapshot);
     if(selected.length!==findingIds.length||selected.some(f=>(action==="replace"?rules.find(r=>r.id===f.rule_id)?.treatment!=="replace":rules.find(r=>r.id===f.rule_id)?.treatment==="warn"))) fail(400,"この加工に対応した未処理の枠を選んでください。");
     if(action==="replace") {
      const use=await sql("INSERT INTO usage(staff_id,date,replace_count) VALUES(?,?,1) ON CONFLICT(staff_id,date) DO UPDATE SET replace_count=replace_count+1 WHERE replace_count<?",staff.id,date,dailyLimit).run();
      if(!use.meta.changes) fail(429,"今日の置き換え上限に達しました。ぼかしをご利用ください。","rate_limited"); reserved=true;
      const original=await env.PHOTOS.get(p.current_key??p.original_key);if(!original) fail(404,"画像がありません。","not_found");
      bytes=await replaceImage(env,new Uint8Array(await original.arrayBuffer()),selected.map(f=>f.box),drink,p.width,p.height);
     }
     const editId=id(),key=`photos/${p.id}/edit-${editId}.jpg`;
     await env.PHOTOS.put(key,bytes!,{httpMetadata:{contentType:"image/jpeg"}});
     await db.batch([sql("INSERT INTO edits(id,photo_id,kind,finding_ids,drink,result_key,created_by,created_at,previous_key,previous_findings) VALUES(?,?,?,?,?,?,?,?,?,?)",editId,p.id,action,JSON.stringify(findingIds),drink||null,key,staff.id,now(),p.current_key,JSON.stringify(currentFindings.map(({id,status})=>({id,status})))),...selected.map(f=>sql("UPDATE findings SET status='fixed' WHERE id=?",f.id)),sql("UPDATE photos SET current_key=?,status='edited',edited_at=? WHERE id=?",key,now(),p.id)]);
     committed=true;return json({ok:true});
    } finally {
     if(reserved&&!committed) await sql("UPDATE usage SET replace_count=MAX(0,replace_count-1) WHERE staff_id=? AND date=?",staff.id,date).run();
     await recalculate(p);
    }
   }
  }
  if(parts[0]==="findings"&&parts[1]&&post&&["dismiss","restore"].includes(parts[2])) {
   const f=await one<RowFinding>("SELECT * FROM findings WHERE id=?",parts[1]);if(!f) fail(404,"枠が見つかりません。","not_found");
   const p=await photo(f.photo_id,true);
   const target=parts[2]==="dismiss"?"dismissed":"open";
   if(f.status!==(target==="dismissed"?"open":"dismissed")) fail(409,"この枠は変更できません。","invalid_state_transition");
   const lock=await sql("UPDATE photos SET risk_score=-1 WHERE id=? AND risk_score>=0 AND status IN ('detected','edited')",p.id).run();
   if(!lock.meta.changes) fail(409,"別の処理が実行中です。","invalid_state_transition");
   try {await sql("UPDATE findings SET status=? WHERE id=?",target,f.id).run();}finally{await recalculate(p);}
   return json({ok:true});
  }
  return apiError(404,"not_found","ページが見つかりません。");
 } catch(error) {
  if(error instanceof HttpError) return apiError(error.status,error.code,error.message);
  console.error("隠酒の処理エラー", error instanceof Error ? error.message : "不明なエラー");
  return apiError(500,"internal_error","処理に失敗しました。しばらくしてから再試行してください。");
 }
}
