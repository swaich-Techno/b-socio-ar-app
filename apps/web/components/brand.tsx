import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="B Socio AR home">
      <span className="brand-mark" aria-hidden="true"><span>B</span></span>
      {!compact ? <span className="brand-type"><strong>B Socio</strong><small>Augmented reality</small></span> : null}
    </Link>
  );
}
