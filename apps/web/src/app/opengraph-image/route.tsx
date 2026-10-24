import { ImageResponse } from "next/og";
export const alt =
  "Safethrift — Community-Owned, Interest-Free Finance for All";
const size = { width: 1200, height: 630 };
export const dynamic = "force-static";
export function GET() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "70px",
        background: "#eaf0e5",
        color: "#173e32",
      }}
    >
      <div style={{ fontSize: 48 }}>safethrift.</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 66,
          lineHeight: 1.1,
        }}
      >
        <span>Small savings. Shared strength.</span>
        <span>Greater possibility.</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 24,
        }}
      >
        <span>Community-Owned, Interest-Free Finance for All</span>
        <span>In development</span>
      </div>
    </div>,
    size,
  );
}
