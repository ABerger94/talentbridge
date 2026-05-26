export default function TalentBridgeLogo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Curved line from top-left to bottom-right (thicker) */}
      <path
        d="M 4 4 Q 16 16, 28 28"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Curved line from bottom-left to top-right (thinner) */}
      <path
        d="M 4 28 Q 16 16, 28 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Left accent dot */}
      <circle cx="12" cy="16" r="1.5" fill="currentColor" />
      {/* Right accent dot */}
      <circle cx="20" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}