import { requireStaff } from "@/lib/auth";
import { Upload } from "@/components/workbench";
export const dynamic="force-dynamic";
export default async function Home() {await requireStaff();return <Upload/>;}
