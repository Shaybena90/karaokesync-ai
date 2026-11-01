/** סמל SceneOps AI – סמל גנרי מקורי (מגן ועדשה), ללא זיקה לסמל של ארגון אמיתי. */
export function Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="סמל SceneOps AI">
      <defs>
        <linearGradient id="emb-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E9F1FB" />
          <stop offset="1" stopColor="#8FA6C2" />
        </linearGradient>
      </defs>
      <path d="M32 4 54 12v18c0 14-9.5 24-22 30C19.5 54 10 44 10 30V12Z" fill="#0d1f36" stroke="url(#emb-g)" strokeWidth="2.5" />
      <circle cx="32" cy="29" r="12.5" fill="none" stroke="url(#emb-g)" strokeWidth="2.5" />
      <circle cx="32" cy="29" r="5.5" fill="#319BFF" />
      <circle cx="34" cy="27" r="1.6" fill="#E9F1FB" />
      <path d="M18 29h4M42 29h4M32 15v4M32 39v4" stroke="url(#emb-g)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
