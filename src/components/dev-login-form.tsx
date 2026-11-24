"use client";

import { useState, type FormEvent } from "react";

type Member = { id: string; display_name: string; is_lead: boolean };

export function DevLoginForm({demoMode,members}:{demoMode:boolean;members:Member[]}) {
 const [error,setError]=useState("");
 const [pending,setPending]=useState(false);

 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form=event.currentTarget;
  setError("");
  setPending(true);
  try {
   const response=await fetch(form.action,{method:"POST",body:new FormData(form)});
   if(response.redirected) {
    window.location.assign(response.url);
    return;
   }
   const data=await response.json() as {error?:{message?:string}};
   setError(data.error?.message??"ログインに失敗しました。");
  } catch {
   setError("ログインに失敗しました。");
  } finally {
   setPending(false);
  }
 }

 return <form className={demoMode?"demo-login":undefined} action="/api/auth/dev-login" method="post" onSubmit={demoMode?submit:undefined}>
  <h2>{demoMode?"デモ用ログイン":"開発用ユーザー切替"}</h2>
  <p className="muted">{demoMode?"動作確認用のデモです。データはすべて架空です":"架空の広報担当でローカル動作を確認できます。"}</p>
  {demoMode&&<label>パスコード<input type="password" name="passcode" autoComplete="current-password" required/></label>}
  <label>広報担当<select name="staff_id">{members.map(m=><option key={m.id} value={m.id}>{m.display_name}{m.is_lead?"（責任者）":""}</option>)}</select></label>
  {error&&<p className="error" role="alert">{error}</p>}
  <button disabled={pending}>{demoMode?"この担当でログイン":"開発ログイン"}</button>
 </form>;
}
