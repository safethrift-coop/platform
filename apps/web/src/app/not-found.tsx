import { ActionLink, PageHero } from "@/components/marketing";
export default function NotFound() {
  return (
    <>
      <PageHero eyebrow="Page not found" title="Let’s find your way back.">
        <p>
          This page could not be found. Explore Safethrift from the homepage.
        </p>
      </PageHero>
      <div className="container not-found-action">
        <ActionLink href="/">Back to home</ActionLink>
      </div>
    </>
  );
}
