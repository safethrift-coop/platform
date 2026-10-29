import {
  MarketingSite,
  PublicIntro,
  PublicSection,
  PublicNotice,
  TextLink,
  PublicInvitation,
} from "@/components/public-site/editorial";
import { pageMetadata } from "@/lib/seo";
import { products } from "@/lib/content";
import { Icon } from "@/components/icon";
export const metadata = pageMetadata(
  "Products & services",
  "Discover Safethrift’s planned Flexible, Regular and Goal-Based Savings Accounts and proposed future services.",
  "/products",
);
export default function ProductsPage() {
  return (
    <MarketingSite>
      <PublicIntro
        label="Products & services · coming soon"
        title="A place to start. A purpose to save for."
        note="Proposed accounts. None are available to open yet."
      >
        <p>
          Our three proposed savings accounts are designed to support different
          financial journeys and a shared Savings Points model.
        </p>
      </PublicIntro>
      <section
        className="m-wrap m-product-catalogue"
        aria-labelledby="accounts-heading"
      >
        <h2 id="accounts-heading" className="m-visually-hidden">
          Our core savings accounts
        </h2>
        <nav className="m-product-nav" aria-label="Savings accounts">
          {products.map((product) => (
            <a href={`#${product.id}`} key={product.id}>
              {product.code}
              <Icon name="arrow-back" />
            </a>
          ))}
        </nav>
        {products.map((product) => (
          <article
            id={product.id}
            key={product.id}
            className="m-product-detail"
          >
            <span className="m-product-code">{product.code}</span>
            <div>
              <h3 id={`${product.id}-details`}>{product.name}</h3>
              <p>{product.audience}</p>
              <span className="m-status">
                Proposed savings account · coming soon
              </span>
            </div>
            <dl>
              <div>
                <dt>Purpose</dt>
                <dd>{product.purpose}</dd>
              </div>
              <div>
                <dt>The proposed approach</dt>
                <dd>{product.detail}</dd>
              </div>
              <div>
                <dt>Proposed benefit</dt>
                <dd>{product.benefit}</dd>
              </div>
              <div>
                <dt>Before launch</dt>
                <dd className="m-product-terms">
                  Final terms, Savings Points rules, charges and withdrawal
                  conditions will be published before launch.
                </dd>
              </div>
              <div>
                <dt className="m-visually-hidden">Product navigation</dt>
                <dd>
                  <TextLink href={`/products#${product.id}`}>
                    Back to {product.code} overview
                  </TextLink>
                </dd>
              </div>
            </dl>
          </article>
        ))}
        <PublicNotice title="Clarity before commitment">
          <p>
            These descriptions explain the proposed product purposes. Account
            opening, deposits, withdrawals and loan applications are
            unavailable. Final eligibility, charges, contribution requirements,
            withdrawal conditions and Savings Points rules require approval
            before launch. No returns or access to finance are guaranteed.
          </p>
        </PublicNotice>
      </section>
      <PublicSection
        label="The proposed Savings Points model"
        title="Recognising participation over time."
        className="m-sage-section"
      >
        <div className="m-purpose-grid">
          <p className="m-statement">
            Consistent saving. Participation that counts.
          </p>
          <div>
            <p>
              The intention is to recognise consistent saving and participation,
              helping members build a pathway towards responsible, interest-free
              support.
            </p>
            <p>
              Points would form part of future eligibility assessment. They are
              not a promise of a loan or a published entitlement.
              Product-specific rates, limits and conditions have not been
              announced.
            </p>
          </div>
        </div>
      </PublicSection>
      <PublicSection
        label="Looking further ahead"
        title="Ideas under consideration."
      >
        <p className="m-reading-width">
          The business roadmap explores the following future concepts. All
          remain planned, subject to feasibility, approval and any required
          regulatory permissions. No launch dates are confirmed.
        </p>
        <div className="m-future-list">
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
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="m-small">Planned concept</span>
            </article>
          ))}
        </div>
      </PublicSection>
      <PublicInvitation />
    </MarketingSite>
  );
}
