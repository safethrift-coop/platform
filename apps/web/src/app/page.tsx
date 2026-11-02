import Link from "next/link";
import { SavingsGraphic, PublicArrow } from "@/components/public-site/graphics";
import { MarketingSite } from "@/components/public-site/editorial";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata(
  "Community-Owned, Interest-Free Finance for All",
  "Explore a proposed member-owned cooperative built around responsible saving, shared opportunity and interest-free support.",
  "/",
);
export default function HomePage() {
  return (
    <MarketingSite>
      <section className="b-home-hero">
        <div className="b-wrap b-hero-grid">
          <div className="b-hero-copy">
            <p className="b-eyebrow">The Safethrift proposal</p>
            <h1>
              Personal saving.
              <br />
              <em>Shared purpose.</em>
            </h1>
            <p>
              We’re developing an interest-free UK financial cooperative built
              around responsible saving and participation.
            </p>
            <Link className="b-link" href="#idea">
              Understand the proposed model <PublicArrow direction="down" />
            </Link>
          </div>
          <div className="b-hero-identity">
            <div className="b-shared-frame">
              <span className="b-frame-caption">
                THE COOPERATIVE PRINCIPLES
              </span>
              <div className="b-frame-inner">
                <Link className="b-saving-piece" href="#saving">
                  <svg
                    className="b-piece-symbol"
                    aria-hidden="true"
                    viewBox="0 0 80 60"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                  >
                    <path d="M4 42Q18 0 30 30T56 24"></path>
                  </svg>
                  <strong>Saving</strong>
                  <span>Personal commitment</span>
                </Link>
                <Link className="b-participation-piece" href="#participation">
                  <svg
                    className="b-piece-symbol"
                    aria-hidden="true"
                    viewBox="0 0 80 60"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                  >
                    <path d="M4 12h42M4 30h42M4 48h42"></path>
                  </svg>
                  <strong>Participation</strong>
                  <span>Shared responsibility</span>
                </Link>
              </div>
              <Link className="b-accountability-piece" href="#accountability">
                <strong>Accountability</strong>
                <span>
                  Clear information &amp; oversight <PublicArrow />
                </span>
              </Link>
            </div>
            <p className="b-motif-caption">
              Saving and participation, held together by accountability.
            </p>
          </div>
        </div>
      </section>
      <section className="b-wrap b-model" id="idea" tabIndex={-1}>
        <p className="b-eyebrow">Why a cooperative?</p>
        <h2 id="how-it-works" tabIndex={-1}>
          A personal saving habit.
          <br />
          <span>A shared responsibility.</span>
        </h2>
        <div className="b-model-explanation">
          <p>
            The proposed savings-first model brings people together around
            common aims and cooperative ownership principles. Members would
            participate in shaping it, alongside accountable oversight.
          </p>
          <p className="b-note">
            Membership rights and governance arrangements remain subject to
            approved governing documents.
          </p>
        </div>
      </section>
      <section className="b-wrap b-savings-section" id="saving" tabIndex={-1}>
        <p className="b-eyebrow">Proposed savings accounts</p>
        <div className="b-savings-heading">
          <h2>
            Different lives.
            <br />
            Different ways to save.
          </h2>
          <p>
            Three approaches under development.
            <br />
            <strong>None are available to open.</strong>
          </p>
        </div>
        <div className="b-account-grid">
          <Link className="b-account b-fsa" href="/products#fsa">
            <div className="b-account-top">
              <span className="b-code">FSA</span>
              <PublicArrow />
            </div>
            <SavingsGraphic account="fsa" />
            <h3>Flexible Savings Account</h3>
            <p>A flexible approach around changing circumstances.</p>
            <span className="b-account-link">
              Explore the proposal <PublicArrow />
            </span>
          </Link>
          <Link className="b-account b-rsa" href="/products#rsa">
            <div className="b-account-top">
              <span className="b-code">RSA</span>
              <PublicArrow />
            </div>
            <SavingsGraphic account="rsa" />
            <h3>Regular Savings Account</h3>
            <p>A regular monthly saving commitment.</p>
            <span className="b-account-link">
              Explore the proposal <PublicArrow />
            </span>
          </Link>
          <Link className="b-account b-gsa" href="/products#gsa">
            <div className="b-account-top">
              <span className="b-code">GSA</span>
              <PublicArrow />
            </div>
            <SavingsGraphic account="gsa" />
            <h3>Goal-Based Savings Account</h3>
            <p>Saving towards a defined personal objective.</p>
            <span className="b-account-link">
              Explore the proposal <PublicArrow />
            </span>
          </Link>
        </div>
        <div className="b-section-tail">
          <span>Conceptual approaches. Final terms require approval.</span>
          <Link className="b-link" href="/products">
            Compare the proposed accounts <PublicArrow />
          </Link>
        </div>
      </section>
      <section className="b-wrap b-governance" id="participation" tabIndex={-1}>
        <div className="b-governance-intro">
          <p className="b-eyebrow">Participation &amp; governance</p>
          <h2>
            A part to play.
            <br />A duty to each other.
          </h2>
          <p>
            Participation, oversight and reporting: different responsibilities
            within one proposed model.
          </p>
        </div>
        <div className="b-governance-frame" id="accountability" tabIndex={-1}>
          <span className="b-eyebrow">Proposed responsibilities</span>
          <div className="b-members">
            <h3>Members</h3>
            <p>Participate &amp; contribute</p>
          </div>
          <div className="b-role-pair">
            <div>
              <h3>Board</h3>
              <p>Oversee &amp; account</p>
            </div>
            <div>
              <h3>Management</h3>
              <p>Deliver &amp; report</p>
            </div>
          </div>
          <p className="b-note">
            Proposed roles. Final responsibilities require approved governing
            documents.
          </p>
        </div>
      </section>
      <section className="b-wrap b-today">
        <p className="b-eyebrow">Clarity from the start</p>
        <h2>
          Information now.
          <br />
          Services only when ready.
        </h2>
        <div className="b-today-grid">
          <div>
            <h3>Here to understand</h3>
            <p>The proposal, planned accounts and membership information.</p>
            <div id="knowledge" tabIndex={-1}>
              <h3>Learning, in preparation</h3>
              <p>
                Financial education is planned. No guides, articles or member
                stories are published yet.
              </p>
            </div>
          </div>
          <div className="b-closed-note">
            <span className="b-eyebrow">Unavailable</span>
            <h3>Applications &amp; financial services</h3>
            <p>
              Membership applications, account opening, deposits, withdrawals,
              lending and repayments are unavailable.
            </p>
          </div>
        </div>
      </section>
      <section className="b-wrap b-closing" id="membership" tabIndex={-1}>
        <p className="b-eyebrow">Before any commitment</p>
        <h2>
          Shared purpose starts
          <br />
          with clear information.
        </h2>
        <div>
          <p>
            Applications remain closed. Fees, eligibility and final membership
            rights await approved publication. Membership would not guarantee
            access to finance.
          </p>
          <Link className="b-button" href="/products#before-launch">
            Read what must be confirmed <PublicArrow />
          </Link>
        </div>
      </section>
    </MarketingSite>
  );
}
