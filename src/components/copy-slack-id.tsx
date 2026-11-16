"use client";
import { useRef, useState } from "react";
export function CopySlackId({id}:{id:string}) {
  const [message,setMessage]=useState("");
  const field=useRef<HTMLInputElement>(null);
  return <div><label>あなたの Slack ユーザーID<input ref={field} readOnly value={id} onFocus={e=>e.target.select()}/></label><button className="quiet" onClick={async()=>{try{await navigator.clipboard.writeText(id);setMessage("コピーしました。");}catch{field.current?.select();setMessage("IDを選択しました。コピーしてください。");}}}>IDをコピー</button><p role="status">{message}</p></div>;
}
