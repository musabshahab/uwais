import type { ComponentProps } from "react";

/** Props of {@link SiteLink}: those of an anchor, with a required `href`. */
export interface SiteLinkProps extends ComponentProps<"a"> {
  /** Where the link goes: a path of this site such as `/timetable`. */
  href: string;
}

/**
 * A link between pages of the public site, the TV display and the admin area.
 *
 * It is a plain anchor on purpose, and must stay one. `next/link` would turn
 * the click into a soft navigation, which fetches the next page's data from a
 * live server. The site is an installable, offline-capable app: its service
 * worker keeps whole documents (with the prayer times inside them), so only a
 * real document navigation can be answered from the cache when the phone has
 * no signal in the prayer hall. A soft navigation would simply fail there.
 *
 * Lint: `@next/next/no-html-link-for-pages` asks for `next/link` wherever an
 * anchor carries a literal internal path. Every link of the public pages
 * goes through this one component instead, where the path is a prop, so this
 * is the single place the rule is deliberately not followed. It needs no
 * disable comment here (the rule cannot see through a prop, and an unused
 * directive is itself a lint failure); anywhere else, the rule firing means
 * "use SiteLink".
 */
export function SiteLink({ href, ...rest }: SiteLinkProps) {
  return <a href={href} {...rest} />;
}
