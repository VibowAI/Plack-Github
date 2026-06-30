/* eslint-disable @next/next/no-img-element */
import React from 'react';

export default function Image({ src, alt, width, height, fill, className, priority, ...props }: any) {
  // If fill is true, we mimic next/image fill behavior
  const fillStyle: React.CSSProperties = fill
    ? {
        position: 'absolute',
        height: '100%',
        width: '100%',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        objectFit: 'cover',
      }
    : {};

  const resolvedSrc = typeof src === 'object' && src !== null 
    ? (src.src || src.default || '') 
    : src;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{ ...fillStyle, ...props.style }}
      {...props}
    />
  );
}
