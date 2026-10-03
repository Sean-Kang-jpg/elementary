/**
 * The home's hero picture: a small school under a warm sky. Inline SVG so it
 * costs no request and scales on every screen; decorative, so hidden from
 * assistive technology.
 */
export default function SchoolIllustration({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 150" role="presentation" aria-hidden="true" focusable="false">
      <circle cx="196" cy="34" r="18" fill="#FFD7A8" />
      <circle cx="196" cy="34" r="11" fill="#FFC285" />
      <path d="M0 132 Q60 112 120 124 T240 118 V150 H0 Z" fill="#E4F1EA" />
      <rect x="62" y="64" width="116" height="62" rx="6" fill="#FFF7F0" stroke="#F1C9B4" strokeWidth="2" />
      <path d="M54 68 L120 30 L186 68 Z" fill="#F39A7E" />
      <rect x="112" y="10" width="2.5" height="26" rx="1" fill="#C98068" />
      <path d="M114.5 11 H132 L127 16.5 L132 22 H114.5 Z" fill="#F7C873" />
      <circle cx="120" cy="52" r="7" fill="#FFF7F0" stroke="#F1C9B4" strokeWidth="2" />
      <rect x="74" y="78" width="18" height="16" rx="3" fill="#CFE6F2" />
      <rect x="148" y="78" width="18" height="16" rx="3" fill="#CFE6F2" />
      <rect x="74" y="100" width="18" height="16" rx="3" fill="#CFE6F2" />
      <rect x="148" y="100" width="18" height="16" rx="3" fill="#CFE6F2" />
      <path d="M108 126 V102 a12 12 0 0 1 24 0 V126 Z" fill="#F39A7E" opacity="0.85" />
      <circle cx="30" cy="104" r="16" fill="#9CCDB5" />
      <circle cx="40" cy="96" r="12" fill="#B5DCC7" />
      <rect x="31" y="110" width="4" height="18" rx="2" fill="#B98C6E" />
      <circle cx="214" cy="106" r="12" fill="#B5DCC7" />
      <rect x="212" y="112" width="4" height="14" rx="2" fill="#B98C6E" />
      <path d="M96 134 Q120 128 144 134" stroke="#F6D2C1" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  )
}
