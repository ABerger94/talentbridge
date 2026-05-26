export default function TalentBridgeLogo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer arc - top left to center */}
      <path
        d="M 4 16 Q 16 4, 16 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Middle arc - left to center */}
      <path
        d="M 8 16 Q 16 10, 16 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Outer arc - bottom left to center */}
      <path
        d="M 4 16 Q 16 28, 16 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Middle arc - left bottom to center */}
      <path
        d="M 8 16 Q 16 22, 16 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Outer arc - top right to center */}
      <path
        d="M 28 16 Q 16 4, 16 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Middle arc - right to center */}
      <path
        d="M 24 16 Q 16 10, 16 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Outer arc - bottom right to center */}
      <path
        d="M 28 16 Q 16 28, 16 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Middle arc - right bottom to center */}
      <path
        d="M 24 16 Q 16 22, 16 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}