import React from 'react';

export type BrandLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;

interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
  interactive?: boolean;
  withGlow?: boolean;
  showPulse?: boolean;
  title?: string;
}

const SIZE_MAP: Record<string, { box: string; px: number }> = {
  xs: { box: 'w-5 h-5', px: 20 },
  sm: { box: 'w-7 h-7', px: 28 },
  md: { box: 'w-9 h-9', px: 36 },
  lg: { box: 'w-12 h-12', px: 48 },
  xl: { box: 'w-16 h-16', px: 64 },
  '2xl': { box: 'w-20 h-20', px: 80 }
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  className = '',
  interactive = false,
  withGlow = false,
  showPulse = false,
  title = 'Messenger Schedule Bot'
}) => {
  const sizeConfig = typeof size === 'number' 
    ? { box: '', px: size } 
    : SIZE_MAP[size] || SIZE_MAP.md;

  const style = typeof size === 'number' ? { width: size, height: size } : undefined;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${sizeConfig.box} ${
        interactive ? 'transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer' : ''
      } ${className}`}
      style={style}
      title={title}
    >
      {withGlow && (
        <div
          className="absolute inset-0 rounded-2xl bg-black/20 dark:bg-white/5 blur-md -z-10 pointer-events-none"
          aria-hidden="true"
        />
      )}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full select-none"
        aria-label={title}
      >
        {/* Black Squircle Base */}
        <rect width="64" height="64" rx="16" fill="#09090B" />
        <rect x="1" y="1" width="62" height="62" rx="15" stroke="#27272A" strokeWidth="1.5" />

        {/* Antenna */}
        <path d="M32 18V11H25" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Side Connectors / Ears */}
        <path d="M12 32H16" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M48 32H52" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />

        {/* Bot Head */}
        <rect x="16" y="19" width="32" height="26" rx="6" fill="#FFFFFF" fillOpacity="0.1" stroke="#FFFFFF" strokeWidth="3.5" strokeLinejoin="round" />

        {/* Eyes */}
        <circle cx="26" cy="30" r="3" fill="#FFFFFF" />
        <circle cx="38" cy="30" r="3" fill="#FFFFFF" />

        {/* Mouth */}
        <path d="M26 38H38" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />

        {/* Pulse Dot */}
        {showPulse && (
          <>
            <circle cx="51" cy="13" r="3" fill="#22C55E" />
            <circle cx="51" cy="13" r="4.5" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.6" />
          </>
        )}
      </svg>
    </div>
  );
};
