import { headers } from "next/headers";
import { PageHero } from "@/components/marketing";
import { registrationPreview } from "@/lib/registration-preview";
import { RegistrationJourney } from "./registration-journey";
export async function RegistrationPage({
  initialStage = "create",
}: {
  initialStage?: "create" | "verify" | "login";
}) {
  const preview = registrationPreview(
    process.env,
    (await headers()).get("host") ?? "",
  );
  return (
    <>
      <PageHero
        eyebrow={
          preview ? "Local development preview" : "Membership registration"
        }
        title={
          preview
            ? "Build your application, one step at a time."
            : "Registration is not open yet."
        }
      >
        <p>
          {preview
            ? "Create an account, verify its email, then complete a synthetic membership application. This is a development fixture, not a public application service."
            : "Online applications remain closed while privacy information, terms and declaration content are reviewed. No applicant information is collected on this page."}
        </p>
      </PageHero>
      {preview ? (
        <RegistrationJourney {...preview} initialStage={initialStage} />
      ) : (
        <div className="container">
          <aside className="notice">
            <h2>Approved information comes first</h2>
            <p>
              No payment is collected. Confirmed registration details will be
              published when ready.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
