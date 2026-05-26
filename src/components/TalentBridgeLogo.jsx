export default function TalentBridgeLogo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Primary line (thicker, going from bottom-left to top-right) */}
      <line
        x1="4"
        y1="28"
        x2="28"
        y2="4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Secondary line (thinner, different color, going from top-left to bottom-right) */}
      <line
        x1="4"
        y1="4"
        x2="28"
        y2="28"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}