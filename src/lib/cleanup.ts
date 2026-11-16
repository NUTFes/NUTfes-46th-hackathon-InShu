import { jstDate } from "./domain";

// R2を先に削除する。途中で失敗した場合は行を残し、翌回に再試行する。
export async function cleanup(env: Pick<CloudflareEnv, "DB" | "PHOTOS">, at = new Date()) {
  const expired = await env.DB.prepare("SELECT id FROM photos WHERE expires_at<=? AND status!='expired'").bind(at.toISOString()).all<{id:string}>();
  let count = 0;
  for (const photo of expired.results) {
    let cursor: string | undefined;
    do {
      const objects = await env.PHOTOS.list({prefix:`photos/${photo.id}/`, cursor});
      if (objects.objects.length) await env.PHOTOS.delete(objects.objects.map(o=>o.key));
      cursor = objects.truncated ? objects.cursor : undefined;
    } while (cursor);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM findings WHERE photo_id=?").bind(photo.id),
      env.DB.prepare("DELETE FROM edits WHERE photo_id=?").bind(photo.id),
      env.DB.prepare("UPDATE photos SET status='expired',current_key=NULL,rules_snapshot='[]',error=NULL WHERE id=?").bind(photo.id),
    ]);
    count++;
  }
  const usage = await env.DB.prepare("DELETE FROM usage WHERE date<?").bind(jstDate(new Date(at.getTime()-30*86400000))).run();
  return {expired:count, usage:usage.meta.changes};
}
