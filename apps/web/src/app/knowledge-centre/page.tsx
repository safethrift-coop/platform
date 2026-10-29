import {
  MarketingSite,
  Label,
  PublicIntro,
  PublicSection,
  ResourceIndex,
  PublicLink,
} from "@/components/public-site/editorial";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Knowledge Centre",
  "Explore Safethrift’s planned Insights & Reports, Member Profiles & Community, Practical Guides & Support Tools and Learning Library.",
  "/knowledge-centre",
);
export default function KnowledgePage() {
  return (
    <MarketingSite>
      <PublicIntro
        label="Knowledge Centre"
        title="Good information. Better understanding."
        note="Resources in development. No materials are published yet."
      >
        <p>
          A future home for information, practical guidance and community
          learning, with space to understand saving and cooperative
          participation.
        </p>
      </PublicIntro>
      <section id="materials" className="m-section m-library">
        <div className="m-wrap m-library-grid">
          <div>
            <Label>The planned collection</Label>
            <h2>Explore All Materials</h2>
            <p>
              Four planned resource categories. Materials and links will be
              added when reviewed and ready to use.
            </p>
            <p className="m-small">
              There are no reports, member stories, downloads or learning
              materials available yet.
            </p>
          </div>
          <ResourceIndex />
        </div>
      </section>
      <PublicSection
        label="Our approach to learning"
        title="Good information takes care."
        className="m-sage-section"
      >
        <div className="m-reading-grid">
          <p className="m-statement">
            Understanding should come before a financial decision.
          </p>
          <div>
            <p>
              Our resource descriptions outline intended content and are not
              personalised financial advice. Nothing in the planned collection
              is an invitation to open an account or apply for financial
              support.
            </p>
            <p>
              While resources are being developed, you can explore the mission
              and principles behind Safethrift.
            </p>
            <PublicLink href="/about">Read about Safethrift</PublicLink>
          </div>
        </div>
      </PublicSection>
    </MarketingSite>
  );
}
