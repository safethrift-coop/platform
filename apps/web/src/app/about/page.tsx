import {
  MarketingSite,
  Label,
  PublicIntro,
  PublicSection,
  PublicFAQ,
  PublicInvitation,
} from "@/components/public-site/editorial";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "About us",
  "Learn about Safethrift’s mission, values and proposed approach to member ownership and community governance.",
  "/about",
);
export default function AboutPage() {
  return (
    <MarketingSite>
      <PublicIntro
        label="About Safethrift"
        title="Built around people. Growing through trust."
        note="The organisation and proposed services are in development."
      >
        <p>
          We’re developing a member-owned, interest-free financial cooperative
          with a simple ambition: turn savings into opportunity, without
          exploitation.
        </p>
      </PublicIntro>
      <PublicSection
        label="Our purpose"
        title="Fair finance begins with shared responsibility."
      >
        <div className="m-reading-grid">
          <p className="m-statement">
            A savings habit is personal. The opportunity it creates can be
            shared.
          </p>
          <div>
            <h3>Why Safethrift exists</h3>
            <p>
              We aim to serve people and small businesses who are often excluded
              by traditional financial systems. Responsible saving, mutual
              support and community ownership are the ideas behind the proposal.
            </p>
            <h3>Our mission</h3>
            <p>
              To provide fair, interest-free financial access by enabling people
              and small businesses to build opportunity through disciplined
              saving, shared responsibility, and cooperative ownership.
            </p>
            <h3>Our vision</h3>
            <p>
              To create strong, self-reliant communities that finance growth and
              opportunity together.
            </p>
            <p>
              We are preparing our organisation and proposed services; we are
              not accepting deposits or providing loans through this website.
            </p>
          </div>
        </div>
      </PublicSection>
      <PublicSection
        label="Our values"
        title="Principles to put into practice."
      >
        <ol className="m-principles">
          {[
            [
              "Champion inclusion",
              "Design for people with different backgrounds, circumstances and income patterns.",
            ],
            [
              "Enable change",
              "Support positive financial habits through education and transparent processes.",
            ],
            [
              "Expand opportunity",
              "Help individuals, families and small businesses work towards meaningful goals.",
            ],
            [
              "Interest-free support",
              "Develop a responsible alternative built around saving and shared responsibility.",
            ],
            [
              "Invest in communities",
              "Keep community benefit central to the model and its future development.",
            ],
            [
              "Be accountable",
              "Make room for member participation, clear information and responsible oversight.",
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
      </PublicSection>
      <PublicSection
        id="governance"
        label="Community ownership & governance"
        title="A future shaped by its members."
        dark
      >
        <p className="m-governance-intro">
          The proposed structure is a member-owned cooperative, with democratic
          participation and accountable oversight. Legal structure and
          governance arrangements remain subject to confirmation.
        </p>
        <div className="m-governance-list">
          {[
            [
              "Member participation",
              "The intention is for members to have a voice in key decisions and the election of directors, subject to approved governing documents.",
            ],
            [
              "Board oversight",
              "The proposed board would oversee strategy, financial responsibility, transparency and compliance.",
            ],
            [
              "Day-to-day management",
              "A future management team would be responsible for delivering services and reporting to the board.",
            ],
          ].map(([title, text], index) => (
            <article key={title}>
              <Label>0{index + 1} / Proposed role</Label>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </PublicSection>
      <PublicSection
        label="Organisational information"
        title="Verified details, when confirmed."
      >
        <div className="m-facts">
          <article>
            <Label>Information pending</Label>
            <h3>Team & founding directors</h3>
            <p>
              Verified team biographies and appointments will be shared here
              when confirmed. No director or board appointments are announced on
              this website.
            </p>
          </article>
          <article>
            <Label>No current vacancies</Label>
            <h3>Contributing to Safethrift</h3>
            <p>
              Future opportunities to contribute will be published here. There
              are currently no advertised roles or application channels on this
              website.
            </p>
          </article>
        </div>
      </PublicSection>
      <PublicFAQ title="Transparency from the start." />
      <PublicInvitation />
    </MarketingSite>
  );
}
