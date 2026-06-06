interface EVoyageLogoProps {
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

const sizeClasses = {
  sm: {
    mark: 'h-6 w-8 sm:h-7 sm:w-9',
    text: 'text-lg sm:text-xl',
  },
  md: {
    mark: 'h-8 w-10',
    text: 'text-2xl',
  },
} as const;

export default function EVoyageLogo({ size = 'sm', className = '' }: EVoyageLogoProps) {
  const classes = sizeClasses[size];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center gap-1.5 select-none ${className}`}
    >
      <svg
        viewBox="0 0 112 84"
        className={`${classes.mark} text-[var(--color-accent)] shrink-0`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M36 36 C14 20 9 66 38 74 C67 82 92 61 88 35 C84 12 46 15 39 43 H94"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="91" cy="43" r="3.5" fill="var(--color-background)" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      <span className={`font-[family-name:var(--font-heading)] font-bold tracking-tight leading-none text-[var(--color-foreground)] ${classes.text}`}>
        Voyage
      </span>
    </span>
  );
}
