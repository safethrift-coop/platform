import type { Metadata } from "next";
import { RegistrationPage } from "@/components/registration/registration-page";
export const metadata: Metadata = {
  title: "Membership registration",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return <RegistrationPage initialStage="verify" />;
}
