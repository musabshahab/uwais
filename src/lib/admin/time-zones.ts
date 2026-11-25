/**
 * Presenting the list of timezones in the settings form: grouped by region,
 * narrowed by a search, and never without the value that is stored.
 */

/** Group for zones that have no region part, such as `UTC`. */
export const GENERAL_REGION = "General";

/** A zone as an option of the list. */
export interface TimeZoneOption {
  /** The IANA name, e.g. `Europe/London`: what is stored. */
  value: string;
  /** The place as people write it, e.g. `London`. */
  label: string;
}

/** The zones of one region, in the order they were given. */
export interface TimeZoneGroup {
  region: string;
  zones: TimeZoneOption[];
}

/** `Europe/London` gives `Europe`; a zone without a slash belongs to the general group. */
export function timeZoneRegion(zone: string): string {
  const slash = zone.indexOf("/");
  return slash === -1 ? GENERAL_REGION : zone.slice(0, slash);
}

/** The place part of a zone, readable: `America/Argentina/Buenos_Aires` gives `Argentina, Buenos Aires`. */
export function timeZoneLabel(zone: string): string {
  const slash = zone.indexOf("/");
  const place = slash === -1 ? zone : zone.slice(slash + 1);
  return place.replace(/_/g, " ").replace(/\//g, ", ");
}

/**
 * The list with `selected` guaranteed to be in it. A stored zone that this
 * server's runtime does not list (an older alias, a newer zone) is put
 * first rather than silently replaced by another choice.
 */
export function withSelectedZone(zones: readonly string[], selected: string): string[] {
  if (selected === "" || zones.includes(selected)) return [...zones];
  return [selected, ...zones];
}

/** Lower case, with the separators people leave out or type differently removed. */
function searchKey(text: string): string {
  return text.toLowerCase().replace(/[\s_/,.-]+/g, "");
}

/**
 * The zones that match a search. Matching ignores case, spaces, underscores
 * and slashes, so `new york`, `New_York` and `america/new` all find
 * `America/New_York`. `selected` always stays in the result, so narrowing
 * the list can never change the chosen value.
 */
export function filterTimeZones(zones: readonly string[], query: string, selected: string): string[] {
  const key = searchKey(query);
  if (key === "") return [...zones];
  return zones.filter((zone) => zone === selected || searchKey(zone).includes(key));
}

/** Groups zones by region, keeping the order of both the regions and the zones. */
export function groupTimeZones(zones: readonly string[]): TimeZoneGroup[] {
  const groups = new Map<string, TimeZoneOption[]>();
  for (const zone of zones) {
    const region = timeZoneRegion(zone);
    const options = groups.get(region) ?? [];
    options.push({ value: zone, label: timeZoneLabel(zone) });
    groups.set(region, options);
  }
  return Array.from(groups, ([region, options]) => ({ region, zones: options }));
}
