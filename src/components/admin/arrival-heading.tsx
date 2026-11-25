"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Props of {@link ArrivalHeading}. */
export interface ArrivalHeadingProps {
  id: string;
  className?: string;
  children: ReactNode;
}

/**
 * The heading of a step that replaces the one before it on the same page.
 * It takes focus when it appears, so a keyboard or screen reader user lands
 * on the new step instead of being left where a button used to be.
 */
export function ArrivalHeading({ id, className, children }: ArrivalHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h2 ref={ref} id={id} tabIndex={-1} className={cn(className, "focus:outline-none")}>
      {children}
    </h2>
  );
}
