import {requireStaff} from "@/lib/auth";
import {Gallery} from "@/components/remaining";
export default async function Page(){await requireStaff("/gallery");return <Gallery/>;}
