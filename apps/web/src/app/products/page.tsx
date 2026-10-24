import {
  ClosingCTA,
  PageHero,
  ProductCards,
  Section,
} from "@/components/marketing";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Products & services",
  "Discover Safethrift’s planned Flexible, Regular and Goal-Based Savings Accounts and proposed future services.",
  "/products",
);
export default function ProductsPage() {
  return (
    <>
      <PageHero
        eyebrow="Products & services · coming soon"
        title="A place to start. A purpose to save for."
      >
        <p>
          Our three proposed savings accounts are designed to support different
          financial journeys and a shared Savings Points model. None are
          available to open yet.
        </p>
      </PageHero>
      <Section
        eyebrow="Our core savings accounts"
        title="Find the idea that fits your life."
      >
        <ProductCards detailed />
        <aside className="notice">
          <h3>Clarity before commitment</h3>
          <p>
            These descriptions explain the proposed product purposes. Account
            opening, deposits, withdrawals and loan applications are
            unavailable. Final eligibility, charges, contribution requirements,
            withdrawal conditions and Savings Points rules require approval
            before launch. No returns or access to finance are guaranteed.
          </p>
        </aside>
      </Section>
      <Section
        eyebrow="The proposed Savings Points model"
        title="Recognising participation over time."
        className="tinted"
      >
        <div className="split">
          <p className="lead">
            The intention is to recognise consistent saving and participation,
            helping members build a pathway towards responsible, interest-free
            support.
          </p>
          <p>
            Points would form part of future eligibility assessment. They are
            not a promise of a loan or a published entitlement. Product-specific
            rates, limits and conditions have not been announced.
          </p>
        </div>
      </Section>
      <Section
        eyebrow="Looking further ahead"
        title="Ideas for a growing community."
      >
        <p className="section-intro">
          The business roadmap explores the following future concepts. All
          remain planned, subject to feasibility, approval and any required
          regulatory permissions. No launch dates are confirmed.
        </p>
        <div className="grid two">
          {[
            [
              "Goal-Based Savings & Micro Support",
              "Goal-Based Savings Pots (GSPs) and Micro Support Advances are proposed ways to support specific goals and short-term needs.",
            ],
            [
              "Business & Household Support",
              "A Micro Enterprise Support Account and Household Stability Support are concepts for self-employed members and families.",
            ],
            [
              "Long-Term Savings & Community Investment",
              "Long-Term Cooperative Savings Bonds and Community Investment Circles are future concepts for shared and longer-term goals.",
            ],
            [
              "Digital Tools & Financial Wellbeing",
              "A Safethrift Financial Wellbeing App and Ethical Insurance-Like Protection Products are exploratory concepts, requiring further assessment and approval.",
            ],
          ].map(([title, text]) => (
            <article className="card" key={title}>
              <span className="status">Planned concept</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </Section>
      <ClosingCTA />
    </>
  );
}
