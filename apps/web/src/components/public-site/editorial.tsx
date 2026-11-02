import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { faqs, resources } from "@/lib/content";
import "./marketing.css";

export function MarketingSite({ children }: { children: ReactNode }) {
  return <div className="marketing-site">{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="m-label">{children}</p>;
}

export function PublicLink({
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
      className={`button m-button${secondary ? " button-secondary" : ""}`}
      href={href}
    >
      {children}
      <Icon name="arrow-back" />
    </Link>
  );
}

export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="m-text-link" href={href}>
      {children}
      <Icon name="arrow-back" />
    </Link>
  );
}

export function PublicIntro({
  label,
  title,
  children,
  note,
}: {
  label: string;
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="m-intro m-wrap">
      <Label>{label}</Label>
      <div className="m-intro-grid">
        <h1>{title}</h1>
        <div className="m-intro-copy">
          {children}
          {note && <p className="m-small m-intro-note">{note}</p>}
        </div>
      </div>
    </section>
  );
}

export function PublicSection({
  label,
  title,
  children,
  id,
  dark = false,
  className = "",
}: {
  label: string;
  title: string;
  children: ReactNode;
  id?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`m-section ${dark ? "m-dark" : ""} ${className}`}
    >
      <div className="m-wrap">
        <div className="m-section-heading">
          <Label>{label}</Label>
          <h2>{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

export function PublicNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="m-notice">
      <h3>{title}</h3>
      <div>{children}</div>
    </aside>
  );
}

export function ResourceIndex({ preview = false }: { preview?: boolean }) {
  return (
    <div className={`m-resource-index ${preview ? "m-resource-preview" : ""}`}>
      {resources.map((resource, index) => (
        <article key={resource.name}>
          <span className="m-resource-number" aria-hidden="true">
            0{index + 1}
          </span>
          <div>
            <h3>{resource.name}</h3>
            <p>{resource.description}</p>
          </div>
          <span className="m-small m-resource-status">In development</span>
        </article>
      ))}
    </div>
  );
}

export function PublicFAQ({
  title = "A few things to know.",
}: {
  title?: string;
}) {
  return (
    <section className="m-section m-faq">
      <div className="m-wrap m-faq-grid">
        <div>
          <Label>Clear answers</Label>
          <h2>{title}</h2>
          <p>Understanding the proposal should come before any commitment.</p>
        </div>
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
      </div>
    </section>
  );
}

export function PublicInvitation() {
  return (
    <section className="closing m-invitation">
      <div className="m-wrap m-invitation-inner">
        <div>
          <Label>Get to know Safethrift</Label>
          <h2>
            A shared purpose.
            <br />A part to play.
          </h2>
          <p>Explore what membership would mean, before applications open.</p>
        </div>
        <div>
          <PublicLink href="/membership">Explore membership</PublicLink>
          <p className="m-small">
            No applications or payments are accepted here.
          </p>
        </div>
      </div>
    </section>
  );
}
