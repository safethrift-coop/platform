import { FAQ, Journey, PageHero, Section } from "@/components/marketing";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Membership",
  "Understand Safethrift’s proposed membership, shared responsibilities and participation. Online applications are not yet open.",
  "/membership",
);
export default function MembershipPage() {
  return (
    <>
      <PageHero
        eyebrow="Membership · not yet open"
        title="A shared purpose. A part to play."
      >
        <p>
          Membership would mean supporting fair finance, participating in
          community life and helping shape a cooperative built around its
          members.
        </p>
      </PageHero>
      <Section
        eyebrow="Why membership matters"
        title="More than access to finance."
      >
        <div className="split">
          <p className="lead">
            We aim to bring together individuals, households, gig workers,
            migrants, entrepreneurs and others who share our values.
          </p>
          <p>
            Membership is intended as a commitment to shared responsibility and
            long-term financial empowerment. Final eligibility and membership
            rights will be confirmed in approved terms. Membership would not
            guarantee access to a loan or any other financial service.
          </p>
        </div>
      </Section>
      <Section
        eyebrow="Shared benefits. Shared responsibilities."
        title="What being a member would mean."
        className="tinted"
      >
        <div className="grid two membership-values">
          <article className="card">
            <h3>A voice and a connection</h3>
            <ul>
              <li>Participation in a community with shared values.</li>
              <li>
                A voice in governance, subject to approved governing documents.
              </li>
              <li>
                Future learning resources and support for positive financial
                habits.
              </li>
              <li>
                The opportunity to explore proposed services once available and
                subject to their terms.
              </li>
            </ul>
          </article>
          <article className="card">
            <h3>A commitment to each other</h3>
            <ul>
              <li>Support the cooperative’s aims and values.</li>
              <li>Participate responsibly and respect other members.</li>
              <li>
                Understand and follow approved membership and product terms.
              </li>
              <li>Meet any agreed membership commitments once confirmed.</li>
            </ul>
          </article>
        </div>
      </Section>
      <Section
        eyebrow="Before applications open"
        title="Clear terms come first."
      >
        <article className="card fee-panel">
          <div>
            <p className="eyebrow">Membership fees</p>
            <h3>Confirmed before you commit.</h3>
          </div>
          <p>
            Annual membership fees are proposed, but final amounts and payment
            terms have not been confirmed for publication. Approved fees will be
            displayed before applications open. No membership payments are
            collected here.
          </p>
        </article>
        <div className="membership-journey">
          <h3>The planned membership journey</h3>
          <Journey
            items={[
              {
                title: "Get informed",
                text: "Read the approved membership terms and privacy notice when published.",
                icon: "library",
              },
              {
                title: "Apply when open",
                text: "Complete an application once online registration opens.",
                icon: "insights",
              },
              {
                title: "Hear from Safethrift",
                text: "Receive an application decision and, if approved, the next steps.",
                icon: "voice",
              },
            ]}
          />
        </div>
        <aside className="notice">
          <h3>Registration is not open yet</h3>
          <p>
            There is no application form, waiting list or payment facility here.
            Details will be published when the organisation, terms and
            registration process are ready.
          </p>
        </aside>
      </Section>
      <Section eyebrow="Membership questions" title="Know what to expect.">
        <FAQ />
      </Section>
    </>
  );
}
