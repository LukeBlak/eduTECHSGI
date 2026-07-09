"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** Pixel size for both width and height (the logo is square). */
  size?: number;
  /** Optional className applied to the wrapper. */
  className?: string;
  /**
   * Visual treatment of the logo container.
   * - "card": white rounded card with subtle ring (good on dark/colored backgrounds)
   * - "plain": just the image, no container (good on white backgrounds)
   */
  variant?: "card" | "plain";
  /** Alt text for accessibility. */
  alt?: string;
  /** Optional click handler. */
  onClick?: () => void;
}

/**
 * Brand logo for EduTECH ESEN.
 *
 * The source asset (`/EduTech_LogoConNombre.png`) is a 2048×2048 RGBA PNG
 * that already includes the "EduTECH" wordmark below a circuit-tree icon and
 * has a solid white background. Because of that white background, when the
 * logo is placed on a dark or colored surface we wrap it in a white rounded
 * "card" container so it reads as an intentional badge rather than a floating
 * white square.
 */
export function BrandLogo({
  size = 40,
  className,
  variant = "card",
  alt = "Logo de EduTECH ESEN",
  onClick,
}: BrandLogoProps) {
  const isCard = variant === "card";
  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "inline-flex items-center justify-center overflow-hidden shrink-0 select-none",
        isCard &&
          "rounded-xl bg-white ring-1 ring-black/5 shadow-sm dark:ring-white/10",
        onClick && "cursor-pointer",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/EduTech_LogoConNombre.png"
        alt={alt}
        width={size}
        height={size}
        priority
        className="h-full w-full object-contain"
        sizes={`${size}px`}
      />
    </span>
  );
}
