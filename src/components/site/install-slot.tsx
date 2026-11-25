/**
 * Reserved for the "Install this app" hint, which belongs to the offline/PWA
 * work and is filled in there.
 *
 * The site layout renders this slot once, as the first thing inside the
 * footer's page-width container (`SiteFooter`), above the contact details.
 * Whatever is returned here is laid out as a block at the full width of that
 * container and is hidden when printing along with the rest of the footer.
 * Returning null, as now, leaves no trace in the page.
 */
export function InstallSlot() {
  return null;
}
