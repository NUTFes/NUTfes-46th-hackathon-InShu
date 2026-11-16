import { requireStaff } from "@/lib/auth";
import { PhotoView } from "@/components/workbench";
export default async function Page({params}:{params:Promise<{id:string}>}) {const {id}=await params;await requireStaff(`/photos/${id}`);return <PhotoView id={id}/>;}
