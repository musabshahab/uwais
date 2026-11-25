"use client";

import { useEffect } from "react";

/** Props of {@link TodayInView}. */
export interface TodayInViewProps {
  /** The id of the frame the table scrolls in. */
  regionId: string;
  /** The id of today's row. */
  rowId: string;
}

/**
 * Where the month table scrolls inside its own frame (phones and tablets),
 * brings today's row to the top of the frame, just under the header, when
 * the page opens. It never moves the page itself, and does nothing where the
 * table is laid out in full. Renders nothing.
 */
export function TodayInView({ regionId, rowId }: TodayInViewProps) {
  useEffect(() => {
    const region = document.getElementById(regionId);
    const row = document.getElementById(rowId);
    if (region === null || row === null || region.scrollHeight <= region.clientHeight) return;
    const header = region.querySelector("thead");
    region.scrollTop = row.offsetTop - (header === null ? 0 : header.offsetHeight);
  }, [regionId, rowId]);
  return null;
}
