import Link from "next/link";
import { Icon } from "@/components/icon";
import {
  ActionLink,
  ClosingCTA,
  FAQ,
  Journey,
  ProductCards,
  Section,
} from "@/components/marketing";
import { steps } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Community-Owned, Interest-Free Finance for All",
  "Explore a proposed member-owned cooperative built around responsible saving, shared opportunity and interest-free support.",
  "/",
);
export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-dot" /> People first. Progress together.
            </p>
            <h1>
              Small savings.
              <br />
              Shared strength.
              <br />
              <em>Greater possibility.</em>
            </h1>
            <p className="hero-tagline">
              Community-Owned, Interest-Free Finance for All
            </p>
            <p className="lead">
              We’re building a member-owned financial cooperative that turns
              responsible saving into opportunity — for people, families and
              small businesses.
            </p>
            <div className="actions">
              <ActionLink href="/products">Discover our approach</ActionLink>
              <ActionLink href="/about" secondary>
                Meet Safethrift
              </ActionLink>
            </div>
            <p className="hero-caption">
              <span className="status-dot" aria-hidden="true" /> In development.
              Rooted in community.
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-grid" />
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-label label-top">ROOTED IN COMMUNITY</div>
            <div className="growth">
              <div className="stem stem-one">
                <i />
                <i />
              </div>
              <div className="stem stem-two">
                <i />
                <i />
              </div>
              <div className="stem stem-three">
                <i />
                <i />
              </div>
              <div className="growth-ground" />
            </div>
            <div className="art-label label-bottom">GROWING TOGETHER</div>
            <span className="art-spark spark-one">✳</span>
            <span className="art-spark spark-two">+</span>
            <div className="art-card">
              <span className="art-card-icon">↗</span>
              <div>
                Shared effort.
                <br />
                <strong>Lasting opportunity.</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="principles-strip">
        <div className="container">
          <span>Member-owned by design</span>
          <span>Interest-free in principle</span>
          <span>Community at heart</span>
        </div>
      </div>
      <Section
        eyebrow="The idea is simple"
        title="A different way to move forward."
        className="intro-section"
      >
        <div className="split">
          <p className="lead">
            Finance should make room for real life. Irregular incomes. New
            beginnings. Ambitions that deserve a chance.
          </p>
          <div>
            <p>
              Traditional financial systems can leave people behind.
              Safethrift’s mission is to create a fairer path through
              disciplined saving, shared responsibility and cooperative
              ownership.
            </p>
            <Link className="text-link" href="/about">
              Why Safethrift exists <Icon name="arrow-back" />
            </Link>
          </div>
        </div>
      </Section>
      <Section
        id="how-it-works"
        eyebrow="How Safethrift would work"
        title="Save today. Build possibility for tomorrow."
        className="tinted"
      >
        <p className="section-intro">
          Our proposed savings-first model puts participation before borrowing.
          Services and final terms remain in development.
        </p>
        <Journey items={steps} />
      </Section>
      <Section
        eyebrow="Proposed products"
        title="Different lives. A shared starting point."
      >
        <p className="section-intro">
          Three planned savings accounts, designed around different needs. All
          are coming soon.
        </p>
        <ProductCards />
      </Section>
      <Section
        eyebrow="Why Safethrift"
        title="More than individual progress."
        className="values-section"
      >
        <div className="grid three value-grid">
          <article>
            <span className="value-icon">
              <Icon name="inclusion" />
            </span>
            <h3>Inclusion comes first</h3>
            <p>
              Our focus is people often underserved by traditional finance,
              including migrants, gig workers and new entrepreneurs.
            </p>
          </article>
          <article>
            <span className="value-icon">
              <Icon name="voice" />
            </span>
            <h3>A voice in the future</h3>
            <p>
              Member participation and accountable governance are at the heart
              of the proposed cooperative model.
            </p>
          </article>
          <article>
            <span className="value-icon">
              <Icon name="shared" />
            </span>
            <h3>Shared responsibility</h3>
            <p>
              We aim to connect positive saving habits with mutual support and
              long-term community benefit.
            </p>
          </article>
        </div>
      </Section>
      <Section eyebrow="Membership" title="Belong to something you believe in.">
        <div className="split">
          <p className="lead">
            Membership would mean sharing in a mission, taking responsibility
            and helping shape what comes next.
          </p>
          <div>
            <p>
              It would be a commitment to a fairer financial future. Membership
              would not guarantee access to finance. Online applications are not
              yet open.
            </p>
            <ActionLink href="/membership" secondary>
              What membership means
            </ActionLink>
          </div>
        </div>
      </Section>
      <Section
        eyebrow="Knowledge Centre"
        title="Confidence starts with understanding."
        className="tinted"
      >
        <div className="split">
          <p className="lead">
            A future home for practical guides, community stories and insights
            into cooperative finance.
          </p>
          <div>
            <p>
              Our learning resources are being developed. Browse the planned
              categories and see what’s coming.
            </p>
            <Link href="/knowledge-centre" className="text-link">
              Explore the Knowledge Centre <Icon name="arrow-back" />
            </Link>
          </div>
        </div>
      </Section>
      <Section eyebrow="A little clarity" title="Your questions, answered.">
        <FAQ />
      </Section>
      <ClosingCTA />
    </>
  );
}
