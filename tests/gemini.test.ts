import {afterEach,describe,expect,it,vi} from "vitest";
import jpeg from "jpeg-js";
import {detect,replaceImage,normalizeJpeg} from "../src/lib/gemini";
import type {Rule} from "../src/lib/domain";
const rules:Rule[]=[{id:"1",name:"お酒",description:"酒類",weight:5,treatment:"replace"}];
const image=()=>new Uint8Array(jpeg.encode({data:Buffer.alloc(32*32*4,220),width:32,height:32},90).data);
afterEach(()=>vi.unstubAllGlobals());
describe("オフラインの判定と加工",()=>{
 it("同じ入力は同じ判定で外部送信しない",async()=>{const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const a=await detect({} as CloudflareEnv,image(),rules);expect(a).toEqual(await detect({} as CloudflareEnv,image(),rules));expect(a).toHaveLength(1);expect(fetch).not.toHaveBeenCalled();});
 it("枠だけを着色し元の寸法を保つ",async()=>{const bytes=image();const result=await replaceImage({} as CloudflareEnv,bytes,[{x:.25,y:.25,w:.5,h:.5}],"麦茶",32,32);const decoded=jpeg.decode(result);expect(decoded.width).toBe(32);expect(decoded.height).toBe(32);expect(decoded.data[(16*32+16)*4+2]).toBeLessThan(120);expect(decoded.data[2]).toBeGreaterThan(200);});
 it("JPEG以外を拒否",()=>expect(()=>normalizeJpeg(new Uint8Array([1,2,3]))).toThrow());
});
describe("Gemini 呼び出し（モックのみ）",()=>{
 const env={GEMINI_API_KEY:"fake-test-key",GEMINI_DETECT_MODEL:"test-model"} as CloudflareEnv;
 it("失敗を最大3回で打ち切る",async()=>{const fetch=vi.fn().mockResolvedValue(new Response("error",{status:503}));vi.stubGlobal("fetch",fetch);await expect(detect(env,image(),rules)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(3);});
 it("不正なJSONの後で回復し structured output を指定",async()=>{const fetch=vi.fn().mockResolvedValueOnce(Response.json({candidates:[{content:{parts:[{text:"invalid"}]}}]})).mockResolvedValue(Response.json({candidates:[{content:{parts:[{text:'{"findings":[]}'}]}}]}));vi.stubGlobal("fetch",fetch);expect(await detect(env,image(),rules)).toEqual([]);expect(fetch).toHaveBeenCalledTimes(2);const request=JSON.parse(fetch.mock.calls[0][1].body);expect(request.generationConfig.responseMimeType).toBe("application/json");});
});
