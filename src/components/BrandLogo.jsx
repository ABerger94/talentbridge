// The EvidenTalent mark (E, V, i) in white, for use on the brand purple.
// Drawn inline so it stays sharp at any size; the full tile is /favicon.png.
export default function BrandLogo({ size = 32 }) {
  return (
    <svg
      viewBox="86 86 340 340"
      width={size}
      height={size}
      role="img"
      aria-label="EvidenTalent"
      className="block"
      fill="none"
      stroke="#fff"
      strokeWidth="32"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform="translate(32 0)">
        <path d="M80 256H184M80 336H216" />
        <path d="M80 176H162Q196 176 209.6 207.1L262.4 328Q272 350 277.9 326.7L316 176" />
        <path d="M366 236V336" />
        <circle cx="366" cy="176" r="19" fill="#fff" stroke="none" />
      </g>
    </svg>
  );
}
