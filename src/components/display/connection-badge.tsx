"use client";

import { WifiOffIcon } from "@/components/brand/icons";
import { cn } from "@/components/ui/cn";
import type { ConnectionStatus } from "@/lib/client/display-data";
import { useDisplay, usePrayerSchedule } from "@/lib/client/prayer-state";
import { describeLastUpdated } from "@/lib/client/prayer-view";
import "./display.css";

/** Props of {@link ConnectionNotice}. */
export interface ConnectionNoticeProps {
  status: ConnectionStatus;
  /** When the data on screen was produced, already formatted; omitted when null. */
  lastUpdated?: string | null;
  /** Size and placement of the badge. */
  className?: string;
}

/** Props of {@link ConnectionBadge}. */
export interface ConnectionBadgeProps {
  /** Also say when the times on screen were last updated. Defaults to true. */
  showLastUpdated?: boolean;
  /** Size and placement of the badge. */
  className?: string;
}

/** Wording of the badge. `live` has none: the badge is not shown. */
const LABELS: Record<Exclude<ConnectionStatus, "live">, string> = {
  offline: "Offline",
  stale: "Reconnecting",
};

/**
 * The badge for a given connection status; nothing visible while `live`.
 *
 * The outer element is a polite live region that is always in the document,
 * because screen readers only announce changes inside a region that already
 * existed: losing the connection is announced once, when the badge fills in.
 */
export function ConnectionNotice({ status, lastUpdated, className }: ConnectionNoticeProps) {
  return (
    <span role="status" aria-live="polite">
      {status === "live" ? null : (
        <span className={cn("display-badge", `display-badge-${status}`, className)}>
          <WifiOffIcon className="display-badge-icon" size="1.15em" />
          <span className="display-badge-label">{LABELS[status]}</span>
          {lastUpdated ? (
            <span className="display-badge-detail">{`Last updated ${lastUpdated}`}</span>
          ) : null}
        </span>
      )}
    </span>
  );
}

/**
 * Tells the viewer when the prayer times on screen may be out of date:
 * `Offline` when the device has no network, `Reconnecting` when the server
 * cannot be reached properly, each with the time the saved data dates from.
 * Shows nothing while the connection is live. Must be rendered inside
 * `DisplayProvider`.
 */
export function ConnectionBadge({ showLastUpdated = true, className }: ConnectionBadgeProps) {
  const { status, lastUpdatedMs, settings } = useDisplay();
  const schedule = usePrayerSchedule();
  const lastUpdated =
    showLastUpdated && status !== "live"
      ? describeLastUpdated(lastUpdatedMs, schedule === null ? null : schedule.today, settings)
      : null;
  return <ConnectionNotice status={status} lastUpdated={lastUpdated} className={className} />;
}
