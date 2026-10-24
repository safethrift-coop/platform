import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { faqs, navigation, products, resources } from "@/lib/content";

export function ActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      className={`button${secondary ? " button-secondary" : ""}`}
      href={href}
    >
      {children}
      <span className="action-icon">
        <Icon name="arrow" />
      </span>
    </Link>
  );
}
export function Section({
  id,
  eyebrow,
  title,
  children,
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`section ${className}`}>
      <div className="container">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}
export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="page-hero">
      <div className="container">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="lead">{children}</div>
      </div>
    </section>
  );
}
export function Status({ children = "Coming soon" }: { children?: ReactNode }) {
  return (
    <span className="status">
      <span className="status-dot" aria-hidden="true" /> {children}
    </span>
  );
}
const productIcons = ["flexible", "regular", "goal"] as const;
const resourceIcons = ["insights", "community", "tools", "library"] as const;

export function ProductCards({ detailed = false }: { detailed?: boolean }) {
  return (
    <>
      <div className="grid three product-grid">
        {products.map((product, index) => (
          <article
            className={`card product-card product-${product.id}`}
            id={detailed ? product.id : undefined}
            key={product.id}
          >
            <div className="product-visual" aria-hidden="true">
              <div className="product-motif">
                <Icon name={productIcons[index]} />
              </div>
              <span className="product-code">{product.code}</span>
              <span className="product-visual-line" />
            </div>
            <div className="product-body">
              <div className="card-top">
                <span className="product-kind">Proposed savings account</span>
                <Status />
              </div>
              <h3>{product.name}</h3>
              <p className="card-audience">{product.audience}</p>
              <dl className="product-facts">
                <div>
                  <dt>Purpose</dt>
                  <dd>{product.purpose}</dd>
                </div>
                <div>
                  <dt>Proposed benefit</dt>
                  <dd>{product.benefit}</dd>
                </div>
              </dl>
              <Link
                className="product-link"
                href={`/products#${product.id}-details`}
              >
                Explore {product.code}
                <span className="action-icon">
                  <Icon name="arrow" />
                </span>
              </Link>
            </div>
          </article>
        ))}
      </div>
      {detailed && (
        <section
          className="product-details"
          aria-label="Detailed product information"
        >
          {products.map((product, index) => (
            <article
              className="product-detail"
              id={`${product.id}-details`}
              key={product.id}
            >
              <div className="product-detail-heading">
                <Icon name={productIcons[index]} />
                <p className="eyebrow">{product.code} · Coming soon</p>
                <h3>{product.name}</h3>
              </div>
              <div>
                <p>{product.detail}</p>
                <p className="product-terms">
                  Final terms, Savings Points rules, charges and withdrawal
                  conditions will be published before launch.
                </p>
                <Link className="text-link" href={`/products#${product.id}`}>
                  Back to {product.code} overview <Icon name="arrow-up" />
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
export function Journey({
  items,
}: {
  items: readonly { title: string; text: string; icon?: IconName }[];
}) {
  return (
    <ol
      className="journey"
      style={{ "--journey-count": items.length } as React.CSSProperties}
    >
      {items.map((item, index) => (
        <li key={item.title}>
          <div className="journey-marker">
            <span>0{index + 1}</span>
            {item.icon && <Icon name={item.icon} />}
          </div>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </li>
      ))}
    </ol>
  );
}
export function ResourceCards() {
  return (
    <div className="grid two resource-grid">
      {resources.map((resource, index) => (
        <article className="card resource-card" key={resource.name}>
          <div className="resource-heading">
            <span className="resource-icon">
              <Icon name={resourceIcons[index]} />
            </span>
            <Status />
          </div>
          <h3>{resource.name}</h3>
          <p>{resource.description}</p>
          <div className="resource-footnote">
            Materials in development<span aria-hidden="true">—</span>
          </div>
        </article>
      ))}
    </div>
  );
}
export function FAQ() {
  return (
    <div className="faq-list">
      {faqs.map(({ question, answer }) => (
        <details key={question}>
          <summary>
            {question}
            <span aria-hidden="true">+</span>
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}
export function ClosingCTA() {
  return (
    <section className="closing">
      <div className="container closing-inner">
        <div>
          <p className="eyebrow">A shared vision. A fairer future.</p>
          <h2>
            Opportunity grows
            <br />
            when we grow together.
          </h2>
          <p>Get to know the values behind our proposed cooperative.</p>
        </div>
        <ActionLink href="/membership">Explore membership</ActionLink>
      </div>
    </section>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <Link href="/" className="wordmark" aria-label="Safethrift home">
              safethrift<span aria-hidden="true">.</span>
            </Link>
            <p>
              Community-Owned,
              <br />
              Interest-Free Finance for All
            </p>
          </div>
          <nav aria-label="Footer navigation">
            <p className="eyebrow">Explore Safethrift</p>
            {navigation.slice(1).map(({ href, label }) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="footer-note">
            <p className="eyebrow">Built on shared values</p>
            <p>
              Responsible saving.
              <br />
              Mutual support.
              <br />
              Community opportunity.
            </p>
          </div>
        </div>
        <div className="footer-disclosure">
          <p className="footer-disclosure-title">Where we are today</p>
          <p>
            Safethrift is in development. Proposed financial services and online
            membership applications are not yet available. No funds or
            applications are accepted through this website.
          </p>
          <p>
            Incorporation, regulatory status, product terms and legal notices
            will be published once verified and approved. This website does not
            claim financial services authorisation or deposit protection.
          </p>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Safethrift</span>
          <span>Built around people. Guided by responsibility.</span>
        </div>
      </div>
    </footer>
  );
}
