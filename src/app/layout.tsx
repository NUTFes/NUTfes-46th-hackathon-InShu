import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata:Metadata={title:"隠酒 | 広報写真チェック",description:"写真を確認して、広報NGの写り込みを直す。"};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="ja"><body><header><Link href="/" className="brand">隠酒 <small>インシュ</small></Link><span>公式広報の写真チェック係</span><form action="/api/auth/logout" method="post"><button className="quiet">ログアウト</button></form></header><main>{children}</main><footer>実際の問題行為を隠すためには使用しないでください。</footer></body></html>;}
