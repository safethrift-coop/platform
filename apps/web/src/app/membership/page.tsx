import {
  MarketingSite,
  PublicIntro,
  PublicSection,
  PublicNotice,
  PublicFAQ,
} from "@/components/public-site/editorial";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Membership",
  "Understand Safethrift’s proposed membership, shared responsibilities and participation. Online applications are not yet open.",
  "/membership",
);
export default function MembershipPage() {
  return (
    <MarketingSite>
      <PublicIntro
        label="Membership · not yet open"
        title="A shared purpose. A part to play."
        note="Online applications remain closed. No membership payments are collected here."
      >
        <p>
          Membership would mean supporting fair finance, participating in
          community life and helping shape a cooperative built around its
          members.
        </p>
      </PublicIntro>
      <PublicSection
        label="Why membership matters"
        title="Belonging brings responsibility."
      >
        <div className="m-purpose-grid">
          <p className="m-statement">
            For individuals, households and small businesses with shared values.
          </p>
          <div>
            <p>
              We aim to bring together individuals, households, gig workers,
              migrants, entrepreneurs and others who share our values.
            </p>
            <p>
              Membership is intended as a commitment to shared responsibility
              and long-term financial empowerment. Final eligibility and
              membership rights will be confirmed in approved terms. Membership
              would not guarantee access to a loan or any other financial
              service.
            </p>
          </div>
        </div>
      </PublicSection>
      <PublicSection
        label="Shared benefits. Shared responsibilities."
        title="What being a member would mean."
        className="m-sage-section"
      >
        <div className="m-membership-pair">
          <article>
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
          <article>
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
      </PublicSection>
      <PublicSection
        label="Before applications open"
        title="Clear terms come first."
      >
        <div className="m-reading-grid">
          <div>
            <h3>Membership fees</h3>
            <p>
              Annual membership fees are proposed, but final amounts and payment
              terms have not been confirmed for publication. Approved fees will
              be displayed before applications open. No membership payments are
              collected here.
            </p>
          </div>
          <div>
            <h3>The planned membership journey</h3>
            <ol className="m-timeline">
              {[
                [
                  "Get informed",
                  "Read the approved membership terms and privacy notice when published.",
                ],
                [
                  "Apply when open",
                  "Complete an application once online registration opens.",
                ],
                [
                  "Hear from Safethrift",
                  "Receive an application decision and, if approved, the next steps.",
                ],
              ].map(([title, text], index) => (
                <li key={title}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <PublicNotice title="Registration is not open yet">
          <p>
            There is no application form, waiting list or payment facility here.
            Details will be published when the organisation, terms and
            registration process are ready.
          </p>
        </PublicNotice>
      </PublicSection>
      <PublicFAQ title="Know what to expect." />
    </MarketingSite>
  );
}
