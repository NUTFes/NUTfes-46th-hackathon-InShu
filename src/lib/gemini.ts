import { parseDetection, type Rule, type Box } from "./domain";
// 秘密の値の前後に付いた BOM・空白・改行を取り除く（PowerShell の Get-Clipboard 経由で登録すると BOM が付くため）
export const geminiKey=(env:{GEMINI_API_KEY?:string})=>(env.GEMINI_API_KEY??"").replace(/^﻿/,"").trim();
import jpeg from "jpeg-js";
const inline=(bytes:Uint8Array)=>({inlineData:{mimeType:"image/jpeg",data:Buffer.from(bytes).toString("base64")}});
async function generate(env:CloudflareEnv,model:string,body:unknown) {
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":geminiKey(env)},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!response.ok) {
  const errorBody=await response.text().catch(()=>"");
  console.error("Gemini HTTP",response.status,errorBody.slice(0,500));
  throw new Error("AI の処理に失敗しました。");
 }
 try {
  return await response.json() as {candidates?:{content?:{parts?:{text?:string;inlineData?:{data:string;mimeType:string}}[]}}[]};
 } catch(error) {
  console.error("Gemini API 応答の解析エラー",error instanceof Error?error.message:String(error));
  throw error;
 }
}
export async function detect(env:CloudflareEnv,bytes:Uint8Array,rules:Rule[]) {
 let error:unknown;
 for(let attempt=0;attempt<3;attempt++) try {
  if(!env.GEMINI_API_KEY) {
   let hash=0; for(let i=0;i<bytes.length;i+=97) hash=(hash*31+bytes[i])>>>0;
   return parseDetection({findings:rules.slice(0,3).map((r,i)=>({rule_name:r.name,box:{x:0.08+i*0.28,y:0.22+(hash%10)/100,w:0.18,h:0.24},reason:"オフライン動作確認用の枠",confidence:0.75+((hash+i)%20)/100}))},rules);
  }
  const response=await generate(env,env.GEMINI_DETECT_MODEL||"gemini-3.8-flash",{
   contents:[{parts:[{text:`広報写真のチェック係として、次の基準に当てはまる写り込みだけを挙げる。当てはまらないものは挙げない。迷ったら confidence を低くして挙げる。人物の容姿については述べない。理由は日本語30字以内。枠は画像の左上を原点とする0〜1の割合。基準: ${JSON.stringify(rules.map(({name,description})=>({name,description})))}`},inline(bytes)]}],
   generationConfig:{responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{findings:{type:"ARRAY",items:{type:"OBJECT",properties:{rule_name:{type:"STRING"},box:{type:"OBJECT",properties:{x:{type:"NUMBER"},y:{type:"NUMBER"},w:{type:"NUMBER"},h:{type:"NUMBER"}},required:["x","y","w","h"]},reason:{type:"STRING"},confidence:{type:"NUMBER"}},required:["rule_name","box","reason","confidence"]}}},required:["findings"]}}
  });
  const content=response.candidates?.[0]?.content?.parts?.map(p=>p.text??"").join("");
  try {
   if(!content?.trim()) throw new Error("判定結果が空です。");
   return parseDetection(content,rules);
  } catch(error) {
   console.error("Gemini 判定結果の解析エラー",error instanceof Error?error.message:String(error));
   throw error;
  }
 } catch(e) { error=e; }
 throw error;
}
export function readJpeg(bytes:Uint8Array) {
 // 大きすぎる画像は展開前に SOF ヘッダーで拒否する。
 if(bytes[0]!==255||bytes[1]!==216) throw new Error("JPEG 画像を送信してください。");
 let offset=2, width=0,height=0;
 while(offset+4<bytes.length) {
  if(bytes[offset++]!==255) continue;
  const marker=bytes[offset++]; if(marker===0xda||marker===0xd9) break;
  if(marker===0xff||marker===0x00||marker===0xd8||(marker>=0xd0&&marker<=0xd7)) continue;
  const len=(bytes[offset]<<8)|bytes[offset+1]; if(len<2||offset+len>bytes.length) break;
  if([0xc0,0xc1,0xc2].includes(marker)) {height=(bytes[offset+3]<<8)|bytes[offset+4];width=(bytes[offset+5]<<8)|bytes[offset+6];break;}
  offset+=len;
 }
 if(!width||!height||width>2048||height>2048) throw new Error("長辺2048px以内の JPEG が必要です。");
 const decoded=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:5,maxMemoryUsageInMB:96});
 return decoded;
}
export function normalizeJpeg(bytes:Uint8Array) {const image=readJpeg(bytes);return {bytes:new Uint8Array(jpeg.encode(image,90).data),width:image.width,height:image.height};}
export async function replaceImage(env:CloudflareEnv,bytes:Uint8Array,boxes:Box[],drink:string,width:number,height:number) {
 if(!env.GEMINI_API_KEY) {
  const image=readJpeg(bytes);
  for(const b of boxes) for(let y=Math.floor(b.y*height);y<Math.min(height,Math.ceil((b.y+b.h)*height));y++) for(let x=Math.floor(b.x*width);x<Math.min(width,Math.ceil((b.x+b.w)*width));x++) {
   const n=(y*width+x)*4;image.data[n]=Math.round(image.data[n]*0.35+255*0.65);image.data[n+1]=Math.round(image.data[n+1]*0.35+170*0.65);image.data[n+2]=Math.round(image.data[n+2]*0.35+30*0.65);
  }
  return new Uint8Array(jpeg.encode(image,90).data);
 }
 const response=await generate(env,env.GEMINI_EDIT_MODEL||"gemini-3.8-flash-image",{contents:[{parts:[{text:`枠の中の酒類だけを『${drink}』に置き換える。容器の形・大きさ・光の当たり方・影を保つ。枠の外、特に人物の顔・体・背景は変えない。飲み物でなければ置き換えず元の画像を返す。おまかせは元のお酒の色に近いソフトドリンク。出力はJPEG画像。枠（0〜1）:${JSON.stringify(boxes)}`},inline(bytes)]}],generationConfig:{responseModalities:["TEXT","IMAGE"]}});
 const image=response.candidates?.[0]?.content?.parts?.find(p=>p.inlineData)?.inlineData;
 if(!image||!image.mimeType.startsWith("image/")) throw new Error("加工画像を取得できませんでした。");
 const raw=Buffer.from(image.data,"base64");
 if(raw.length>20*1024*1024) throw new Error("加工画像が大きすぎます。");
 if(image.mimeType==="image/png" && (raw.length<24 || raw.readUInt32BE(16)*raw.readUInt32BE(20)>16000000)) throw new Error("加工画像が大きすぎます。");
 // 画像編集モデルの PNG 出力にも対応し、元の寸法で JPEG に統一する。
 const { PNG }=await import("pngjs");
 const decoded=image.mimeType==="image/png"?PNG.sync.read(raw):jpeg.decode(raw,{useTArray:true,maxResolutionInMP:16,maxMemoryUsageInMB:128});
 if(decoded.width*decoded.height>16000000) throw new Error("加工画像が大きすぎます。");
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++) for(let x=0;x<width;x++) {const a=(y*width+x)*4,b=(Math.floor(y*decoded.height/height)*decoded.width+Math.floor(x*decoded.width/width))*4;for(let c=0;c<4;c++) data[a+c]=decoded.data[b+c];}
 return new Uint8Array(jpeg.encode({data,width,height},90).data);
}
