import type { CSSProperties } from "react";

export type IconName =
  | "arrow"
  | "arrow-up"
  | "arrow-back"
  | "flexible"
  | "regular"
  | "goal"
  | "inclusion"
  | "voice"
  | "shared"
  | "insights"
  | "community"
  | "tools"
  | "library";
const paths: Record<IconName, React.ReactNode> = {
  arrow: <path d="M5 19 19 5M5 5h14v14" />,
  "arrow-up": <path d="m6 10 6-6 6 6M12 4v16" />,
  "arrow-back": <path d="M4 12h16m-6-6 6 6-6 6" />,
  flexible: (
    <>
      <path d="M4 8h12a4 4 0 0 1 0 8H4m0-4h10M7 5 4 8l3 3m10 2 3 3-3 3" />
    </>
  ),
  regular: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2" />
    </>
  ),
  goal: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="m12 12 8-8m-4 0h4v4" />
    </>
  ),
  inclusion: (
    <>
      <path d="M5 20v-6a7 7 0 0 1 14 0v6M3 20h18M9 20v-5a3 3 0 0 1 6 0v5" />
    </>
  ),
  voice: (
    <>
      <path d="M20 11a7 7 0 0 1-7 7H7l-4 3V8a5 5 0 0 1 5-5h7a5 5 0 0 1 5 5Zm-12-3h7m-7 4h4" />
    </>
  ),
  shared: (
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="17" r="2" />
      <circle cx="19" cy="17" r="2" />
      <path d="M5 12a7 7 0 0 1 3-5m8 0a7 7 0 0 1 3 5m-10 7a7 7 0 0 0 6 0" />
    </>
  ),
  insights: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6m-6 4h6m-6 4h3m3 0v3" />
    </>
  ),
  community: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" />
    </>
  ),
  tools: (
    <>
      <path d="m4 18 9-9m-2-5a6 6 0 0 0 8 8l-7 7a4 4 0 0 1-6-6l7-7m3-2 4 4" />
    </>
  ),
  library: (
    <>
      <path d="M12 6C9 3 5 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 2Zm0 0v15M6 8h3m6 0h3" />
    </>
  ),
};
export function Icon({
  name,
  className = "",
  style,
}: {
  name: IconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`line-icon ${className}`}
      style={style}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
