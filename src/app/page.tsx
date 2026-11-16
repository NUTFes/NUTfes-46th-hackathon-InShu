import { requireStaff } from "@/lib/auth";
import { Upload } from "@/components/workbench";
export const dynamic="force-dynamic";
export default async function Home() {const staff=await requireStaff();return <><p className="muted">{staff.display_name} さん</p><Upload/></>;}
