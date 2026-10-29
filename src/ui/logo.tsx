// The Daybook app icon: an open book with a rising line on the right page, on Apple's blue-to-indigo.
// Kept in sync with public/icon.svg (the favicon and home-screen icon).

export function AppLogo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="daybook-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0A84FF" />
          <stop offset="1" stopColor="#5E5CE6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#daybook-bg)" />
      <path d="M12 19.5c6.2-1.6 12.4-1 18.5 1.6V47c-6.1-2.6-12.3-3.2-18.5-1.6Z" fill="#fff" fillOpacity=".9" />
      <path d="M52 19.5c-6.2-1.6-12.4-1-18.5 1.6V47c6.1-2.6 12.3-3.2 18.5-1.6Z" fill="#fff" />
      <path d="M37.5 40l4.2-5.3 3.4 2.4 4.4-7.1" fill="none" stroke="#5E5CE6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="49.5" cy="30" r="2" fill="#5E5CE6" />
    </svg>
  );
}
