"use client";

import type { ReactNode } from "react";
import {
  ExternalLinkIcon,
  HeartIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  type IconComponent,
} from "@/components/brand/icons";
import { LogoMark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { addressLines, externalHref, mailtoHref, telHref } from "@/lib/site/contact";
import type { SiteSettings } from "@/lib/types";
import { noScriptReveal } from "./no-script";

const UNDERLINE =
  "underline decoration-line-strong underline-offset-4 transition-colors duration-fast hover:text-fg hover:decoration-fg";

/** A contact detail that can be acted on: an icon and a link, one 44px touch target. */
function ContactLink({
  icon: Icon,
  label,
  href,
  className,
  children,
}: {
  icon: IconComponent;
  label: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li>
      <a href={href} className="group inline-flex min-h-control max-w-full items-center gap-3 rounded-md hover:text-fg">
        <Icon className="text-accent-fg" />
        <span className="sr-only">{`${label}: `}</span>
        <span className={cn("min-w-0 group-hover:decoration-fg", UNDERLINE, className)}>{children}</span>
      </a>
    </li>
  );
}

/** The link to the map: it leaves the site, and says so with the icon. */
function MapLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-control items-center gap-1.5 rounded-md", UNDERLINE)}
    >
      Map and directions
      <ExternalLinkIcon size="1em" />
    </a>
  );
}

/** The settings the contact block shows. */
export type ContactSettings = Pick<
  SiteSettings,
  "mosqueName" | "tagline" | "address" | "phone" | "email" | "mapUrl" | "donateUrl"
>;

/** Props of {@link ContactDetails}. */
export interface ContactDetailsProps {
  settings: ContactSettings;
}

/**
 * Who the mosque is and how to reach it: name, tagline and whichever of the
 * address, phone, email, map and donation links have been filled in. With
 * nothing filled in it is just the name.
 *
 * A Client Component fed plain settings, so that the server renders the
 * block in one piece (see `TimetableView` for why that matters); nothing in
 * it changes in the browser.
 */
export function ContactDetails({ settings }: ContactDetailsProps) {
  const address = addressLines(settings.address);
  const phoneHref = telHref(settings.phone);
  const emailHref = mailtoHref(settings.email);
  const mapHref = externalHref(settings.mapUrl);
  const donateHref = externalHref(settings.donateUrl);
  const tagline = settings.tagline.trim();
  const hasPlace = address.length > 0 || mapHref !== null;

  return (
    <div {...noScriptReveal("contact")} className="min-w-0">
      <p className="flex items-center gap-3 font-display text-xl leading-tight font-semibold tracking-tight text-fg">
        <LogoMark size={32} />
        {settings.mosqueName}
      </p>
      {tagline ? <p className="mt-2 max-w-prose">{tagline}</p> : null}
      {hasPlace || phoneHref !== null || emailHref !== null ? (
        <ul className="mt-4 flex flex-col">
          {hasPlace ? (
            <li className="flex gap-3">
              <MapPinIcon className="mt-3 text-accent-fg" />
              <div className="min-w-0">
                {address.length > 0 ? (
                  <address className="pt-2.5 not-italic">
                    <span className="sr-only">Address: </span>
                    {address.map((line, index) => (
                      <span key={`${index}-${line}`} className="block">
                        {line}
                      </span>
                    ))}
                  </address>
                ) : null}
                {mapHref !== null ? <MapLink href={mapHref} /> : <span className="block h-2.5" />}
              </div>
            </li>
          ) : null}
          {phoneHref !== null ? (
            <ContactLink icon={PhoneIcon} label="Phone" href={phoneHref} className="numerals">
              {settings.phone.trim()}
            </ContactLink>
          ) : null}
          {emailHref !== null ? (
            <ContactLink icon={MailIcon} label="Email" href={emailHref} className="break-all">
              {settings.email.trim()}
            </ContactLink>
          ) : null}
        </ul>
      ) : null}
      {donateHref !== null ? (
        <p className="mt-5">
          <a href={donateHref} rel="noopener noreferrer" className={buttonClasses({ variant: "secondary" })}>
            <HeartIcon />
            Support the mosque
          </a>
        </p>
      ) : null}
    </div>
  );
}
