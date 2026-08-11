import React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export function Logo({ className = "w-7 h-7 sm:w-8 sm:h-8", ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={`shrink-0 transition-transform duration-300 group-hover:scale-105 ${className}`}
      {...props}
    >
      <defs>
        <linearGradient id="neon-pink-header" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff00a0" />
          <stop offset="50%" stopColor="#e6007e" />
          <stop offset="100%" stopColor="#cc0066" />
        </linearGradient>

        <filter id="neon-glow-header" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#neon-glow-header)">
        {/* Внешняя рамка (Ромб) */}
        <path
          d="M 256 48 L 464 256 L 256 464 L 48 256 Z"
          fill="none"
          stroke="url(#neon-pink-header)"
          strokeWidth="14"
          strokeLinejoin="round"
        />

        {/* Внутренняя обводка рамки */}
        <path
          d="M 256 72 L 440 256 L 256 440 L 72 256 Z"
          fill="none"
          stroke="url(#neon-pink-header)"
          strokeWidth="5"
          strokeOpacity="0.8"
          strokeLinejoin="round"
        />

        {/* Глитч-нотчи / кибер-детали на грани ромба */}
        <path
          d="M 120 120 L 145 100 M 367 110 L 390 133 M 115 375 L 140 400 M 370 390 L 395 365"
          stroke="url(#neon-pink-header)"
          strokeWidth="6"
          strokeLinecap="square"
        />

        <path
          d="M 160 170 L 175 155 M 340 160 L 350 170 M 150 340 L 165 355 M 345 345 L 360 330"
          stroke="url(#neon-pink-header)"
          strokeWidth="4"
        />

        {/* Центральный элемент: Молния-Стрелка */}
        <path
          d="M 248 116 L 288 116 L 260 216 L 316 216 L 284 316 L 292 316 L 256 388 L 220 316 L 228 316 L 252 236 L 196 236 L 248 116 Z"
          fill="none"
          stroke="url(#neon-pink-header)"
          strokeWidth="12"
          strokeLinejoin="miter"
          strokeMiterlimit="4"
        />

        <path
          d="M 250 136 L 274 136 L 250 220 L 296 220 L 270 300 L 276 300 L 256 352 L 236 300 L 242 300 L 262 232 L 216 232 L 250 136 Z"
          fill="none"
          stroke="url(#neon-pink-header)"
          strokeWidth="5"
          strokeLinejoin="miter"
        />
      </g>
    </svg>
  );
}
