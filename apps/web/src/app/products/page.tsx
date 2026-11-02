import Link from "next/link";
import { SavingsGraphic, PublicArrow } from "@/components/public-site/graphics";
import { MarketingSite } from "@/components/public-site/editorial";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Products & services",
  "Discover Safethrift’s planned Flexible, Regular and Goal-Based Savings Accounts and proposed future services.",
  "/products",
);
export default function ProductsPage() {
  return (
    <MarketingSite>
      <section className="b-wrap b-product-intro">
        <p className="b-eyebrow">Products &amp; services / in development</p>
        <h1>
          Your circumstances.
          <br />
          Your saving approach.
        </h1>
        <div className="b-product-intro-bottom">
          <p>
            Flexible, regular or goal-based. Three proposed accounts, each with
            a different starting point.
          </p>
          <p className="b-intro-status">
            <strong>Proposed. Not available to open.</strong>
            <br />
            No account opening, deposits or withdrawals.
          </p>
        </div>
        <nav className="b-account-jump" aria-label="Account navigation">
          <span>Explore the proposals</span>
          <Link id="fsa-overview" href="#fsa">
            FSA <PublicArrow direction="down" />
          </Link>
          <Link id="rsa-overview" href="#rsa">
            RSA <PublicArrow direction="down" />
          </Link>
          <Link id="gsa-overview" href="#gsa">
            GSA <PublicArrow direction="down" />
          </Link>
        </nav>
      </section>
      <section className="b-wrap b-comparison">
        <table>
          <caption>Compare the proposed saving approaches</caption>
          <thead>
            <tr>
              <th scope="col">Proposed account</th>
              <th scope="col" id="fsa-column">
                <Link href="#fsa">
                  FSA <PublicArrow direction="down" />
                </Link>
                <span>Flexible Savings Account</span>
              </th>
              <th scope="col" id="rsa-column">
                <Link href="#rsa">
                  RSA <PublicArrow direction="down" />
                </Link>
                <span>Regular Savings Account</span>
              </th>
              <th scope="col" id="gsa-column">
                <Link href="#gsa">
                  GSA <PublicArrow direction="down" />
                </Link>
                <span>Goal-Based Savings Account</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Approach</th>
              <td>Flexible saving</td>
              <td>Monthly commitment</td>
              <td>A personal target</td>
            </tr>
            <tr>
              <th scope="row">Purpose</th>
              <td>Adapt to changing circumstances</td>
              <td>Build a regular habit</td>
              <td>Save for a specific objective</td>
            </tr>
          </tbody>
        </table>
        <p>
          An explanation of proposed purposes, not a product offer. All three
          are unavailable.
        </p>
      </section>
      <div className="b-wrap b-product-stories">
        <section className="b-product-story b-fsa" id="fsa" tabIndex={-1}>
          <div className="b-product-visual">
            <span className="b-code">FSA</span>
            <SavingsGraphic account="fsa" />
            <span className="b-visual-caption">
              A flexible approach around changing circumstances.
            </span>
          </div>
          <div className="b-story-copy">
            <p className="b-eyebrow">Proposed account</p>
            <h2 id="fsa-details" tabIndex={-1}>
              Flexible Savings Account
            </h2>
            <h3>Room to adapt.</h3>
            <p>
              Designed around irregular incomes and a flexible approach to
              saving, rather than a fixed deposit schedule.
            </p>
            <p className="b-note">
              Flexibility describes a saving approach. Withdrawal conditions and
              other terms remain unconfirmed.
            </p>
            <Link className="b-back-link" href="#fsa-overview">
              Back to FSA overview <PublicArrow direction="up" />
            </Link>
          </div>
        </section>
        <section className="b-product-story b-rsa" id="rsa" tabIndex={-1}>
          <div className="b-product-visual">
            <span className="b-code">RSA</span>
            <SavingsGraphic account="rsa" />
            <span className="b-visual-caption">
              A regular monthly saving commitment.
            </span>
          </div>
          <div className="b-story-copy">
            <p className="b-eyebrow">Proposed account</p>
            <h2 id="rsa-details" tabIndex={-1}>
              Regular Savings Account
            </h2>
            <h3>Find your rhythm.</h3>
            <p>
              Designed around a regular monthly saving commitment, with intended
              recognition of consistent participation through Savings Points.
            </p>
            <p className="b-note">
              Points rules require approval. Consistent saving would not
              guarantee a loan or other financial support.
            </p>
            <Link className="b-back-link" href="#rsa-overview">
              Back to RSA overview <PublicArrow direction="up" />
            </Link>
          </div>
        </section>
        <section className="b-product-story b-gsa" id="gsa" tabIndex={-1}>
          <div className="b-product-visual">
            <span className="b-code">GSA</span>
            <SavingsGraphic account="gsa" />
            <span className="b-visual-caption">
              Saving towards a defined personal objective.
            </span>
          </div>
          <div className="b-story-copy">
            <p className="b-eyebrow">Proposed account</p>
            <h2 id="gsa-details" tabIndex={-1}>
              Goal-Based Savings Account
            </h2>
            <h3>A purpose in mind.</h3>
            <p>
              Designed around a personal target, such as an emergency fund or
              equipment for work, with intended recognition of saving
              milestones.
            </p>
            <p className="b-note">
              Targets, milestone recognition and product conditions are not yet
              approved for publication.
            </p>
            <Link className="b-back-link" href="#gsa-overview">
              Back to GSA overview <PublicArrow direction="up" />
            </Link>
          </div>
        </section>
      </div>
      <section className="b-wrap b-points">
        <div>
          <p className="b-eyebrow">Proposed Savings Points</p>
          <h2>
            Participation deserves
            <br />
            clear rules.
          </h2>
        </div>
        <div>
          <p>
            Savings Points are intended to recognise consistent saving and
            cooperative participation. If approved, they would form part of
            future eligibility assessment, subject to approved rules and
            individual assessment.
          </p>
          <p className="b-points-caution">
            Points would not promise a loan or create a published entitlement.
            No rates, limits or conversion rules are announced.
          </p>
        </div>
      </section>
      <section
        className="b-wrap b-before-launch"
        id="before-launch"
        tabIndex={-1}
      >
        <div>
          <p className="b-eyebrow">Common to all three accounts</p>
          <h2>Before anything opens.</h2>
          <p>
            Approved information must be published before any account becomes
            available. No returns or access to finance are guaranteed.
          </p>
        </div>
        <ul>
          <li>Eligibility &amp; contribution requirements</li>
          <li>Charges &amp; withdrawal conditions</li>
          <li>Savings Points rules</li>
          <li>Product terms &amp; required approvals</li>
        </ul>
      </section>
      <aside className="b-wrap b-future">
        <p className="b-eyebrow">
          Exploratory concepts / separate from core accounts
        </p>
        <h2>Further ideas. Earlier in development.</h2>
        <p>
          Goal-based savings &amp; micro support; business &amp; household
          support; long-term savings &amp; community investment; digital tools
          &amp; financial wellbeing.
        </p>
        <p className="b-note">
          Subject to feasibility, approval and any required permissions. No
          launch dates are confirmed.
        </p>
      </aside>
      <section className="b-wrap b-closing b-product-close">
        <p className="b-eyebrow">The idea behind the accounts</p>
        <h2>
          A shared purpose.
          <br />A part to understand.
        </h2>
        <div>
          <p>
            Membership applications remain closed. Membership would not
            guarantee access to finance.
          </p>
          <Link className="b-button" href="/#idea">
            Explore the cooperative proposal <PublicArrow />
          </Link>
        </div>
      </section>
    </MarketingSite>
  );
}
