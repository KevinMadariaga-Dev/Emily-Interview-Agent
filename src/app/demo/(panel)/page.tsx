import { redirect } from "next/navigation";

/** Old demo URL → the panel now lives at /admin (behind login). */
export default function DemoRedirect() {
  redirect("/admin");
}
