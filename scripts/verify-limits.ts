import {getPlatformProxy} from "wrangler";
import jpeg from "jpeg-js";
import assert from "node:assert/strict";
import {signSession,SESSION_COOKIE} from "../src/lib/session";
import {jstDate} from "../src/lib/domain";
// 実在の担当ではなく架空の担当3の上限を一時的に変更し、最後に元へ戻す。
const {env,dispose}=await getPlatformProxy<CloudflareEnv>({persist:{path:".wrangler/state/v3"}});
const base=process.env.INSHU_URL||"http://localhost:3200",staffId="sample-staff-3",date=jstDate(),sessionId=crypto.randomUUID();
const old=await env.DB.prepare("SELECT replace_count FROM usage WHERE staff_id=? AND date=?").bind(staffId,date).first<{replace_count:number}>();
const headers={Origin:base,Cookie:`${SESSION_COOKIE}=${await signSession(sessionId,env.SESSION_SECRET!)}`};
async function request(path:string,body:unknown) {return fetch(base+path,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});}
try {
 await env.DB.prepare("INSERT INTO sessions(id,staff_id,expires_at,created_at) VALUES(?,?,?,?)").bind(sessionId,staffId,new Date(Date.now()+600000).toISOString(),new Date().toISOString()).run();
 const batch=await (await request("/api/batches",{photo_count:1})).json() as {id:string};
 const bytes=jpeg.encode({data:Buffer.alloc(32*32*4,220),width:32,height:32},90).data;
 const uploaded=await fetch(`${base}/api/batches/${batch.id}/photos`,{method:"POST",headers:{...headers,"Content-Type":"image/jpeg"},body:new Uint8Array(bytes)});assert.equal(uploaded.status,200);
 const photo=await uploaded.json() as {id:string};
 assert.equal((await request(`/api/photos/${photo.id}/replace`,{finding_ids:["missing"],drink:"麦茶"})).status,409);
 assert.equal((await request(`/api/photos/${photo.id}/detect`,{})).status,200);
 const details=await (await fetch(`${base}/api/photos/${photo.id}`,{headers})).json() as {findings:{id:string;rule_id:string}[]};
 const finding=details.findings.find(f=>f.rule_id==="rule-1")!;
 const limit=Number(env.REPLACE_DAILY_LIMIT)||100;
 await env.DB.prepare("INSERT INTO usage(staff_id,date,replace_count) VALUES(?,?,?) ON CONFLICT(staff_id,date) DO UPDATE SET replace_count=excluded.replace_count").bind(staffId,date,limit).run();
 assert.equal((await request(`/api/photos/${photo.id}/replace`,{finding_ids:[finding.id],drink:"麦茶"})).status,429);
 const after=await env.DB.prepare("SELECT replace_count FROM usage WHERE staff_id=? AND date=?").bind(staffId,date).first<{replace_count:number}>();assert.equal(after?.replace_count,limit);
 // 上限の1回手前で異なる2枚を同時加工しても、成功は1回だけ。
 const batch2=await (await request("/api/batches",{photo_count:1})).json() as {id:string};
 const uploaded2=await fetch(`${base}/api/batches/${batch2.id}/photos`,{method:"POST",headers:{...headers,"Content-Type":"image/jpeg"},body:new Uint8Array(bytes)});
 const photo2=await uploaded2.json() as {id:string};await request(`/api/photos/${photo2.id}/detect`,{});
 const details2=await (await fetch(`${base}/api/photos/${photo2.id}`,{headers})).json() as {findings:{id:string;rule_id:string}[]};const finding2=details2.findings.find(f=>f.rule_id==="rule-1")!;
 await env.DB.prepare("UPDATE usage SET replace_count=? WHERE staff_id=? AND date=?").bind(limit-1,staffId,date).run();
 const responses=await Promise.all([request(`/api/photos/${photo.id}/replace`,{finding_ids:[finding.id],drink:"麦茶"}),request(`/api/photos/${photo2.id}/replace`,{finding_ids:[finding2.id],drink:"麦茶"})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,429]);
 console.log("API検証成功：加工前409・日次上限429・異なる写真の同時加工でも日次上限を厳守");
}finally{
 await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sessionId).run();
 if(old) await env.DB.prepare("UPDATE usage SET replace_count=? WHERE staff_id=? AND date=?").bind(old.replace_count,staffId,date).run();
 else await env.DB.prepare("DELETE FROM usage WHERE staff_id=? AND date=?").bind(staffId,date).run();
 await dispose();
}
