"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
export function Navigation({lead}:{lead:boolean}) {
 const path=usePathname();
 return <nav aria-label="メインナビゲーション">{[["/","チェック"],["/gallery","ギャラリー"],...(lead?[["/lead/rules","基準の編集"],["/lead/staff","担当の管理"]]:[])].map(([href,label])=><Link key={href} href={href} aria-current={(href==="/"?!path.startsWith("/gallery")&&!path.startsWith("/lead")&&path!=="/login":path.startsWith(href))?"page":undefined}>{label}</Link>)}</nav>;
}
