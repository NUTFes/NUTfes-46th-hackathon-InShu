import {getPlatformProxy} from "wrangler";
import assert from "node:assert/strict";
import {cleanup} from "../src/lib/cleanup";
const {env,dispose}=await getPlatformProxy<CloudflareEnv>({persist:{path:".wrangler/state/v3"}});
const batch=crypto.randomUUID(),expired=crypto.randomUUID(),fresh=crypto.randomUUID(),staff="sample-staff-1",at=new Date(),before=new Date(at.getTime()-1000).toISOString(),after=new Date(at.getTime()+86400000).toISOString();
try{
 await env.DB.prepare("INSERT INTO batches(id,staff_id,photo_count,created_at) VALUES(?,?,2,?)").bind(batch,staff,at.toISOString()).run();
 for(const [id,expires] of [[expired,before],[fresh,after]]){
  const original=`photos/${id}/original.jpg`,current=`photos/${id}/edit-test.jpg`;
  await env.PHOTOS.put(original,"original");await env.PHOTOS.put(current,"edited");await env.PHOTOS.put(`photos/${id}/orphan.jpg`,"orphan");
  await env.DB.prepare("INSERT INTO photos(id,batch_id,staff_id,status,original_key,current_key,width,height,created_at,expires_at) VALUES(?,?,?,'edited',?,?,10,10,?,?)").bind(id,batch,staff,original,current,at.toISOString(),expires).run();
  await env.DB.prepare("INSERT INTO findings(id,photo_id,rule_id,box,reason,confidence,source,status) VALUES(?,?,'rule-1','{}','試験',1,'ai','fixed')").bind(crypto.randomUUID(),id).run();
  await env.DB.prepare("INSERT INTO edits(id,photo_id,kind,finding_ids,result_key,created_by,created_at,previous_findings) VALUES(?,?,'replace','[]',?,?,?,'[]')").bind(crypto.randomUUID(),id,current,staff,at.toISOString()).run();
 }
 await env.DB.prepare("INSERT INTO usage(staff_id,date,replace_count) VALUES(?,'1990-01-01',1)").bind(staff).run();
 const result=await cleanup(env,at);assert.ok(result.expired>=1);assert.ok(result.usage>=1);
 assert.equal((await env.PHOTOS.list({prefix:`photos/${expired}/`})).objects.length,0);
 assert.equal((await env.PHOTOS.list({prefix:`photos/${fresh}/`})).objects.length,3);
 assert.equal((await env.DB.prepare("SELECT status FROM photos WHERE id=?").bind(expired).first<{status:string}>())?.status,"expired");
 for(const table of ["findings","edits"]){assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE photo_id=?`).bind(expired).first<{n:number}>())?.n,0);assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE photo_id=?`).bind(fresh).first<{n:number}>())?.n,1);}
 assert.equal((await cleanup(env,at)).expired,0);
 console.log("削除検証成功：期限切れR2全版・孤立画像・findings・edits・古いusageの削除、未期限写真の維持、冪等性");
}finally{
 for(const id of [expired,fresh]){const objects=await env.PHOTOS.list({prefix:`photos/${id}/`});if(objects.objects.length)await env.PHOTOS.delete(objects.objects.map(o=>o.key));await env.DB.prepare("DELETE FROM photos WHERE id=?").bind(id).run();}
 await env.DB.prepare("DELETE FROM batches WHERE id=?").bind(batch).run();await env.DB.prepare("DELETE FROM usage WHERE staff_id=? AND date='1990-01-01'").bind(staff).run();await dispose();
}
