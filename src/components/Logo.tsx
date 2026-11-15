import React from 'react';
import { SPHEREX_DETECTORS } from '../lib/constants';

// Sphere striped with the six detector band colors. Keep in sync with public/favicon.svg.
export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  const top = 7;
  const h = 20; // sphere diameter
  const band = h / SPHEREX_DETECTORS.length;
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="SPHEREx Data Explorer">
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0e1529" stroke="#2b3964" />
      <clipPath id="sx-logo-sphere">
        <circle cx="14.5" cy="17" r="10" />
      </clipPath>
      <g clipPath="url(#sx-logo-sphere)">
        {SPHEREX_DETECTORS.map((d, i) => (
          <rect key={d.det} x="4" y={top + i * band} width="21" height={band - 0.7} fill={d.color} />
        ))}
      </g>
      <path d="M25 3.6 L25.95 6.55 L28.9 7.5 L25.95 8.45 L25 11.4 L24.05 8.45 L21.1 7.5 L24.05 6.55 Z" fill="#00F0FF" />
    </svg>
  );
};
