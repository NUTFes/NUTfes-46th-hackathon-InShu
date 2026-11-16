import { requireStaff } from "@/lib/auth";
import { BatchView } from "@/components/workbench";
export default async function Page({params}:{params:Promise<{id:string}>}) {const {id}=await params;await requireStaff(`/batches/${id}`);return <BatchView id={id}/>;}
