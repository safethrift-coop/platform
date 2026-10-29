import { pageMetadata } from "@/lib/seo";
import {
  MarketingSite,
  Label,
  PublicLink,
  TextLink,
  CooperativeModel,
  PublicSection,
  ProductOverview,
  ResourceIndex,
  PublicFAQ,
  PublicInvitation,
} from "@/components/public-site/editorial";
export const metadata = pageMetadata(
  "Community-Owned, Interest-Free Finance for All",
  "Explore a proposed member-owned cooperative built around responsible saving, shared opportunity and interest-free support.",
  "/",
);
export default function HomePage() {
  return (
    <MarketingSite>
      <section className="m-hero m-wrap" id="how-it-works">
        <div className="m-hero-copy">
          <Label>A UK cooperative in the making</Label>
          <h1>
            Saving, with a <span>shared purpose.</span>
          </h1>
          <p className="m-hero-lead">
            A proposed financial cooperative built around responsible saving,
            member participation and interest-free support.
          </p>
          <div className="actions">
            <PublicLink href="/products">Explore the proposed model</PublicLink>
            <PublicLink href="/about" secondary>
              About Safethrift
            </PublicLink>
          </div>
          <p className="m-availability">
            <span aria-hidden="true" />
            In development. Accounts, lending and membership applications are
            not open.
          </p>
          <div className="m-hero-signature">
            <span>Community-owned in principle.</span>
            <span>Responsible by design.</span>
          </div>
        </div>
        <CooperativeModel />
      </section>
      <PublicSection
        label="01 / Our purpose"
        title="Room for different lives."
        className="m-purpose"
      >
        <div className="m-purpose-grid">
          <p className="m-statement">
            Irregular incomes. New beginnings. Plans worth saving for.
          </p>
          <div>
            <p>
              Safethrift aims to serve people and small businesses often
              underserved by traditional finance, including migrants, gig
              workers and new entrepreneurs.
            </p>
            <p>
              Our proposed savings-first approach brings together personal
              responsibility and mutual support. Financial education and
              community participation are part of that purpose.
            </p>
            <TextLink href="/about">Why we’re developing Safethrift</TextLink>
          </div>
        </div>
      </PublicSection>
      <PublicSection
        label="02 / Proposed savings accounts"
        title="Different ways to save. One cooperative idea."
      >
        <div className="m-section-deck">
          <p>
            Flexible, regular or goal-based: three proposed approaches to
            building a savings habit. None are available to open yet.
          </p>
          <span className="m-status">Proposed · not yet available</span>
        </div>
        <ProductOverview />
      </PublicSection>
      <PublicSection
        label="03 / Ownership & responsibility"
        title="A voice in the idea. A responsibility to each other."
        dark
      >
        <div className="m-governance-feature">
          <p className="m-statement">
            The people a cooperative serves should have a part in shaping it.
          </p>
          <div>
            <p>
              Member participation, accountable oversight and clear information
              are central to the proposed model. Final governance arrangements
              and membership rights remain subject to approved governing
              documents.
            </p>
            <TextLink href="/about#governance">
              Understand the proposed governance
            </TextLink>
            <div className="m-responsibility-note">
              Membership would not guarantee access to finance.
            </div>
          </div>
        </div>
      </PublicSection>
      <PublicSection
        label="04 / Knowledge Centre"
        title="Understanding comes first."
        className="m-learning"
      >
        <div className="m-section-deck">
          <p>
            We’re developing resources about everyday financial decisions,
            saving and cooperative participation. No materials are published
            yet.
          </p>
          <TextLink href="/knowledge-centre">
            Explore the planned Knowledge Centre
          </TextLink>
        </div>
        <ResourceIndex preview />
      </PublicSection>
      <PublicFAQ />
      <PublicInvitation />
    </MarketingSite>
  );
}
