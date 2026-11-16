import {requireStaff} from "@/lib/auth";
import {Staff} from "@/components/remaining";
export default async function Page(){const staff=await requireStaff("/lead/staff");return <Staff self={staff.id}/>;}
