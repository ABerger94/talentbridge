// The EvidenTalent name as a two-tone wordmark: "Eviden" in the text color,
// "Talent" in grey, both bold. Pass size and weight classes via className;
// `talentClass` sets the grey (use a lighter one on dark backgrounds).
export default function Wordmark({ className = "", talentClass = "text-muted-foreground" }) {
  return (
    <span className={className}>
      Eviden<span className={talentClass}>Talent</span>
    </span>
  );
}
