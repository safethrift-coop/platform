export const navigation = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About us" },
  { href: "/products", label: "Products & services" },
  { href: "/membership", label: "Membership" },
  { href: "/knowledge-centre", label: "Knowledge Centre" },
] as const;

export const products = [
  {
    id: "fsa",
    code: "FSA",
    name: "Flexible Savings Account",
    audience: "For members who need freedom and liquidity",
    purpose:
      "Helps members build a savings habit without pressure, while participating in the Safethrift cooperative model.",
    detail:
      "Designed around irregular incomes and a flexible approach to saving, rather than a fixed deposit schedule.",
    benefit: "A way to build a savings habit at your own pace.",
  },
  {
    id: "rsa",
    code: "RSA",
    name: "Regular Savings Account",
    audience: "For members who want structure and faster access growth",
    purpose:
      "Rewards consistent savers with faster unlocking of cooperative support.",
    detail:
      "Designed around a regular monthly saving commitment and recognition of consistent participation through Savings Points.",
    benefit: "Structure to help make saving part of everyday life.",
  },
  {
    id: "gsa",
    code: "GSA",
    name: "Goal-Based Savings Account",
    audience: "For members saving toward a specific purpose",
    purpose:
      "Helps members achieve meaningful financial goals while strengthening their access profile.",
    detail:
      "Designed around a personal target, such as an emergency fund or business equipment, with recognition of saving milestones.",
    benefit: "A clear purpose to work towards, one step at a time.",
  },
] as const;

export const resources = [
  {
    name: "Insights & Reports",
    description:
      "Planned insights into financial inclusion and cooperative finance.",
  },
  {
    name: "Member Profiles & Community",
    description: "A future space for member experiences and community stories.",
  },
  {
    name: "Practical Guides & Support Tools",
    description:
      "Planned practical resources to support everyday financial decisions.",
  },
  {
    name: "Learning Library",
    description:
      "A future collection of learning materials about saving and cooperative participation.",
  },
] as const;

export const steps = [
  {
    title: "Save first",
    text: "The proposed model starts with building a regular savings habit, at a pace that reflects members’ circumstances.",
  },
  {
    title: "Earn points",
    text: "Savings Points are intended to recognise consistent saving and participation in the cooperative.",
  },
  {
    title: "Borrow responsibly",
    text: "Future access to interest-free support would depend on approved terms and individual assessment. It would never be guaranteed.",
  },
  {
    title: "Repay fairly",
    text: "The proposed approach combines clear, interest-free repayments with continued saving for longer-term resilience.",
  },
] as const;

export const faqs = [
  {
    question: "Can I open an account or apply for support now?",
    answer:
      "No. Safethrift is in development. Savings accounts, lending and online membership applications are not available through this website. Launch information will be published when confirmed.",
  },
  {
    question: "What does interest-free mean?",
    answer:
      "Interest-free support is part of Safethrift’s proposed model. Product terms, any charges and eligibility would need to be confirmed and published before a service becomes available.",
  },
  {
    question: "Does membership guarantee access to finance?",
    answer:
      "No. Membership would be a commitment to shared values and participation. Any future financial support would be subject to approved terms and assessment.",
  },
  {
    question: "Is Safethrift already registered or authorised?",
    answer:
      "This website does not confirm incorporation, financial services authorisation or deposit protection. Verified organisational and regulatory details will be published when available. No funds are being accepted here.",
  },
] as const;
