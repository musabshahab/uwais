"use client";

import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { plural } from "@/lib/admin/text";
import { filterTimeZones, groupTimeZones } from "@/lib/admin/time-zones";

/** Props of {@link TimeZoneField}. */
export interface TimeZoneFieldProps {
  /** Form field name of the list. */
  name: string;
  /** Every zone on offer, built on the server; the stored one is always among them. */
  zones: readonly string[];
  value: string;
  onChange: (zone: string) => void;
  error?: string;
}

/**
 * The timezone picker: a search box that narrows a grouped list. The chosen
 * zone never drops out of the list while searching, so typing cannot change
 * the setting by accident.
 */
export function TimeZoneField({ name, zones, value, onChange, error }: TimeZoneFieldProps) {
  const [query, setQuery] = useState("");
  const selectId = useId();
  const searchId = useId();
  const hintId = useId();
  const errorId = useId();

  const matches = useMemo(() => filterTimeZones(zones, query, value), [zones, query, value]);
  const groups = useMemo(() => groupTimeZones(matches), [matches]);
  // The chosen zone stays listed even when it does not match, so it is not counted as a match.
  const found = query.trim() === "" ? zones.length : matches.filter((zone) => zone !== value).length;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={selectId}>Timezone</Label>
      <p id={hintId} className="text-sm text-fg-muted">
        Every prayer time is shown on this clock, wherever the visitor happens to be. Choose the city nearest to the
        mosque that shares its time.
      </p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <label htmlFor={searchId} className="sr-only">
            Search the list of timezones
          </label>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search, e.g. London"
            autoComplete="off"
            enterKeyHint="search"
            // Enter in the search box must not save the whole form.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </div>
        <Select
          id={selectId}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          invalid={error !== undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        >
          {groups.map((group) => (
            <optgroup key={group.region} label={group.region}>
              {group.zones.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <p role="status" className="text-sm text-fg-muted">
        {query.trim() === ""
          ? `Stored as ${value}.`
          : found === 0
            ? "No timezone matches that search. Try the nearest large city."
            : `${plural(found, "timezone")} ${found === 1 ? "matches" : "match"}. Choose one from the list.`}
      </p>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
