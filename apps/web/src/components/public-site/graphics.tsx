/** Conceptual saving approaches, never a balance, scale, projection or progress bar.
 * Adjacent visible copy supplies the meaning; graphics are decorative to AT. */
export function SavingsGraphic({
  account,
}: {
  account: "fsa" | "rsa" | "gsa";
}) {
  const paths = {
    fsa: "M12 68 H64 Q82 68 82 48 V30 Q82 12 102 12 H158 Q178 12 178 32 V50 Q178 68 198 68 H248",
    rsa: "M16 68 V16 M62 68 V16 M108 68 V16 M154 68 V16 M200 68 V16 M246 68 V16",
    gsa: "M16 42 H224 M224 12 H254 V72 H224",
  };
  return (
    <svg
      className={`b-saving-glyph b-${account}`}
      aria-hidden="true"
      viewBox="0 0 270 84"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
    >
      <path d={paths[account]} />
    </svg>
  );
}

export function PublicArrow({ direction }: { direction?: "up" | "down" }) {
  const path =
    direction === "down"
      ? "M12 3v18m-7-7 7 7 7-7"
      : direction === "up"
        ? "M12 21V3m-7 7 7-7 7 7"
        : "M5 19 19 5M5 5h14v14";
  return (
    <svg
      aria-hidden="true"
      className={`b-ui-arrow${direction ? ` b-${direction}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d={path} />
    </svg>
  );
}
