import {describe,it,expect,vi} from "vitest";
import {cleanup} from "../src/lib/cleanup";
function fixture(fail=false){
 const bind=vi.fn();const run=vi.fn().mockResolvedValue({meta:{changes:2}});
 const DB={prepare:vi.fn((query:string)=>({bind:(...args:unknown[])=>{bind(query,...args);return {all:async()=>({results:[{id:"expired"}]}),run};}})),batch:vi.fn().mockResolvedValue([])};
 const PHOTOS={list:vi.fn().mockResolvedValueOnce({objects:[{key:"photos/expired/a"}],truncated:true,cursor:"next"}).mockResolvedValueOnce({objects:[{key:"photos/expired/b"}],truncated:false}),delete:fail?vi.fn().mockRejectedValue(new Error("R2 unavailable")):vi.fn().mockResolvedValue(undefined)};
 return {env:{DB,PHOTOS} as unknown as CloudflareEnv,DB,PHOTOS,bind};
}
describe("期限切れ削除",()=>{
 it("全ページのオブジェクトを消してから履歴と状態を更新し、JSTの30日前を境界にusageを削除する",async()=>{
  const f=fixture();expect(await cleanup(f.env,new Date("2026-11-16T19:00:00Z"))).toEqual({expired:1,usage:2});
  expect(f.PHOTOS.list).toHaveBeenNthCalledWith(2,{prefix:"photos/expired/",cursor:"next"});
  expect(f.PHOTOS.delete.mock.calls).toEqual([[["photos/expired/a"]],[["photos/expired/b"]]]);
  expect(f.DB.batch).toHaveBeenCalledOnce();expect(f.bind).toHaveBeenCalledWith("DELETE FROM usage WHERE date<?","2026-10-18");
 });
 it("R2削除失敗時はDBを残して再試行可能にする",async()=>{
  const f=fixture(true);await expect(cleanup(f.env)).rejects.toThrow("R2 unavailable");expect(f.DB.batch).not.toHaveBeenCalled();
 });
});
