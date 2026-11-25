"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { CheckIcon, ExternalLinkIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Status } from "@/components/ui/status";
import {
  DEFAULT_TV_ADDRESS_OPTIONS,
  TV_MAX_INSET,
  TV_ROTATIONS,
  clampInset,
  tvAddress,
  tvAddressForTyping,
  tvPath,
  type TvAddressOptions,
  type TvRotationChoice,
} from "@/lib/admin/tv-url";

/** Props of {@link TvAddressBuilder}. */
export interface TvAddressBuilderProps {
  /** The website's public address when the deployment knows it; otherwise the address in use is taken. */
  siteOrigin: string | null;
}

const THEME_OPTIONS = [
  { value: "settings", label: "As in settings" },
  { value: "night", label: "Night" },
  { value: "day", label: "Day" },
] as const;

const SECONDS_OPTIONS = [
  { value: "settings", label: "As in settings" },
  { value: "on", label: "Show" },
  { value: "off", label: "Hide" },
] as const;

const ROTATION_LABELS: Record<TvRotationChoice, string> = {
  0: "Not rotated",
  90: "Quarter turn clockwise (90°)",
  180: "Upside down (180°)",
  270: "Quarter turn anticlockwise (270°)",
};

const noSubscription = () => () => {};

/** The address this page was opened on. Null on the server and until the page has loaded. */
function useBrowserOrigin(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => null,
  );
}

/**
 * Builds the address to type into one screen's browser. The choices are per
 * screen: they are carried in the address and change nothing in the
 * settings, so two screens can differ.
 */
export function TvAddressBuilder({ siteOrigin }: TvAddressBuilderProps) {
  const browserOrigin = useBrowserOrigin();
  const origin = siteOrigin ?? browserOrigin;
  const [options, setOptions] = useState<TvAddressOptions>(DEFAULT_TV_ADDRESS_OPTIONS);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const addressId = useId();

  const update = (patch: Partial<TvAddressOptions>) => {
    setOptions((current) => ({ ...current, ...patch }));
    setCopied(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tvAddress(origin, options));
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p id={addressId} className="text-sm font-semibold text-fg">
          Address for this screen
        </p>
        <p
          aria-labelledby={addressId}
          className="numerals mt-1.5 rounded-md border border-line bg-surface-sunken px-3.5 py-3 text-lg font-semibold break-all text-fg select-all"
        >
          {tvAddressForTyping(origin, options)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={copy} iconStart={copied === "yes" ? <CheckIcon /> : undefined}>
            Copy address
          </Button>
          <Button
            href={tvPath(options)}
            target="_blank"
            rel="noopener"
            variant="secondary"
            size="sm"
            iconStart={<ExternalLinkIcon />}
          >
            Open the display
            <span className="sr-only"> (opens in a new tab)</span>
          </Button>
          <Status tone={copied === "failed" ? "danger" : "success"}>
            {copied === "yes"
              ? "Copied."
              : copied === "failed"
                ? "Copying did not work. Select the address and copy it by hand."
                : null}
          </Status>
        </div>
      </div>

      <fieldset className="min-w-0">
        <legend className="text-base font-semibold text-fg">Options for this screen</legend>
        <p className="mt-0.5 text-sm text-fg-muted">
          Leave them alone and the screen follows the TV settings. Change one and it is added to the address above.
        </p>
        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <SegmentedControl
            name="tv-theme"
            label="Theme"
            showLabel
            fullWidth
            options={THEME_OPTIONS}
            value={options.theme}
            onChange={(theme) => update({ theme })}
          />
          <SegmentedControl
            name="tv-seconds"
            label="Seconds on the clock"
            showLabel
            fullWidth
            options={SECONDS_OPTIONS}
            value={options.seconds}
            onChange={(seconds) => update({ seconds })}
          />
          <FormField label="Rotation" hint="For a screen mounted on its side or upside down.">
            <Select
              value={String(options.rotate)}
              onChange={(event) => update({ rotate: Number(event.target.value) as TvRotationChoice })}
            >
              {TV_ROTATIONS.map((rotation) => (
                <option key={rotation} value={rotation}>
                  {ROTATION_LABELS[rotation]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Margin (percent)"
            hint={`0 to ${TV_MAX_INSET}. Raise it if the edges of the picture are cut off.`}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={TV_MAX_INSET}
              step={1}
              value={options.inset}
              onChange={(event) => update({ inset: clampInset(event.target.valueAsNumber) })}
            />
          </FormField>
        </div>
      </fieldset>
    </div>
  );
}
