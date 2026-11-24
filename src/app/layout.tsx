import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import {BIZ_UDPGothic} from "next/font/google";
import {authEnvironment,getCurrentStaff} from "@/lib/auth";
import {Jug} from "@/components/brand";
import {Navigation} from "@/components/navigation";
const font=BIZ_UDPGothic({weight:["400","700"],subsets:["latin"],display:"swap"});
export const metadata:Metadata={title:"隠酒 | 広報写真チェック",description:"写真を確認して、広報NGの写り込みを直す。"};
export default async function Layout({children}:{children:React.ReactNode}) {const [staff,{demoMode}]=await Promise.all([getCurrentStaff(),authEnvironment()]);return <html lang="ja" className={font.className}><body><header><div className="header-brand"><Link href="/" className="brand"><Jug/><span><b>隠酒</b><small>INSHU｜広報写真チェック</small></span></Link>{demoMode&&<span className="demo-badge">DEMO</span>}</div>{staff&&<><Navigation lead={staff.is_lead}/><div className="account"><span>{staff.display_name}</span><form action="/api/auth/logout" method="post"><button className="quiet">ログアウト</button></form></div></>}</header><main>{children}</main><footer>実際の問題行為を隠すためには使用しないでください。</footer></body></html>;}
