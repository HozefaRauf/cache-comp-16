import { redirect } from "next/navigation";

export default function Home() {
  // Send users to the carousel page by default
  redirect("/framer-motion");
}
