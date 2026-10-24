import {
  ActionLink,
  PageHero,
  ResourceCards,
  Section,
} from "@/components/marketing";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Knowledge Centre",
  "Explore Safethrift’s planned Insights & Reports, Member Profiles & Community, Practical Guides & Support Tools and Learning Library.",
  "/knowledge-centre",
);
export default function KnowledgePage() {
  return (
    <>
      <PageHero
        eyebrow="Knowledge Centre"
        title="Understanding today. Confidence for tomorrow."
      >
        <p>
          A future home for information, practical guidance and community
          learning. Our resources are being developed and are not yet available.
        </p>
      </PageHero>
      <Section
        id="materials"
        eyebrow="Explore All Materials"
        title="A little knowledge can open new possibilities."
      >
        <p className="section-intro">
          These are our four planned resource categories. Materials and links
          will be added when reviewed and ready to use.
        </p>
        <ResourceCards />
        <aside className="notice">
          <h3>Good information takes care</h3>
          <p>
            No reports, member stories, downloads or learning materials are
            published yet. Resource descriptions outline intended content and
            are not personalised financial advice.
          </p>
        </aside>
      </Section>
      <Section
        eyebrow="While we’re getting ready"
        title="Get to know the thinking behind Safethrift."
        className="tinted"
      >
        <p className="section-intro">
          Explore the mission and principles that will guide our future
          resources.
        </p>
        <ActionLink href="/about">Read about Safethrift</ActionLink>
      </Section>
    </>
  );
}
