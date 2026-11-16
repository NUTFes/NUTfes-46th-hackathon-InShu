import {requireStaff} from "@/lib/auth";
export default async function Layout({children}:{children:React.ReactNode}){const staff=await requireStaff("/lead/rules");return staff.is_lead?children:<section className="panel"><h1>責任者の権限が必要です</h1><p>この画面は広報責任者のみ利用できます。</p></section>;}
