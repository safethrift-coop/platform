import {
  ClosingCTA,
  FAQ,
  Journey,
  PageHero,
  Section,
  Status,
} from "@/components/marketing";
import { Icon } from "@/components/icon";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "About us",
  "Learn about Safethrift’s mission, values and proposed approach to member ownership and community governance.",
  "/about",
);
export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Safethrift"
        title="Built around people. Growing through trust."
      >
        <p>
          We’re developing a member-owned, interest-free financial cooperative
          with a simple ambition: turn savings into opportunity, without
          exploitation.
        </p>
      </PageHero>
      <Section
        eyebrow="Who we are"
        title="A shared ambition for fairer finance."
      >
        <div className="split">
          <p className="lead">
            We aim to serve people and small businesses who are often excluded
            by traditional financial systems.
          </p>
          <p>
            Safethrift brings together the ideas of responsible saving, mutual
            support and community ownership. We are preparing our organisation
            and proposed services; we are not accepting deposits or providing
            loans through this website.
          </p>
        </div>
      </Section>
      <Section
        eyebrow="Our purpose"
        title="Opportunity with responsibility."
        className="tinted"
      >
        <div className="grid two purpose-grid">
          <article className="card mission-card">
            <Icon name="goal" />
            <h3>Our mission</h3>
            <p>
              To provide fair, interest-free financial access by enabling people
              and small businesses to build opportunity through disciplined
              saving, shared responsibility, and cooperative ownership.
            </p>
          </article>
          <article className="card vision-card">
            <Icon name="inclusion" />
            <h3>Our vision</h3>
            <p>
              To create strong, self-reliant communities that finance growth and
              opportunity together.
            </p>
          </article>
        </div>
      </Section>
      <Section eyebrow="Our values" title="What guides the work.">
        <div className="grid three about-values">
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
            <article className="card" key={title}>
              <span className="value-index" aria-hidden="true">
                0{index + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section
        id="governance"
        eyebrow="Community ownership & governance"
        title="A future shaped by its members."
        className="tinted"
      >
        <p className="section-intro">
          The proposed structure is a member-owned cooperative, with democratic
          participation and accountable oversight. Legal structure and
          governance arrangements remain subject to confirmation.
        </p>
        <Journey
          items={[
            {
              title: "Member participation",
              text: "The intention is for members to have a voice in key decisions and the election of directors, subject to approved governing documents.",
              icon: "voice",
            },
            {
              title: "Board oversight",
              text: "The proposed board would oversee strategy, financial responsibility, transparency and compliance.",
              icon: "shared",
            },
            {
              title: "Day-to-day management",
              text: "A future management team would be responsible for delivering services and reporting to the board.",
              icon: "community",
            },
          ]}
        />
      </Section>
      <Section eyebrow="The people behind the purpose" title="Meet the team.">
        <div className="grid two">
          <article className="card">
            <Status>Information pending</Status>
            <h3>Team & founding directors</h3>
            <p>
              Verified team biographies and appointments will be shared here
              when confirmed. No director or board appointments are announced on
              this website.
            </p>
          </article>
          <article className="card">
            <Status>No current vacancies</Status>
            <h3>Join the team</h3>
            <p>
              Future opportunities to contribute will be published here. There
              are currently no advertised roles or application channels on this
              website.
            </p>
          </article>
        </div>
      </Section>
      <Section
        eyebrow="Questions about Safethrift"
        title="Transparency from the start."
      >
        <FAQ />
      </Section>
      <ClosingCTA />
    </>
  );
}
