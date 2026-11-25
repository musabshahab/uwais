import type { ReactNode } from "react";
import { ClockIcon, TvIcon, WifiOffIcon, type IconComponent } from "@/components/brand/icons";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TvAddressBuilder } from "./tv-address-builder";

/** One piece of advice for setting up a screen. */
function Tip({ icon: Icon, title, children }: { icon: IconComponent; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-fg">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold text-fg">{title}</p>
        <p className="text-base text-fg-muted">{children}</p>
      </div>
    </li>
  );
}

/**
 * Everything needed to put the timetable on a screen in the mosque: the
 * address to open, the choices one screen can make for itself, and three
 * pieces of advice for the person on the ladder.
 */
export function TvDisplayCard({ siteOrigin }: { siteOrigin: string | null }) {
  return (
    <Card as="section" aria-labelledby="tv-card-title">
      <CardHeader>
        <div>
          <CardTitle id="tv-card-title">TV display</CardTitle>
          <CardDescription>
            Open this address in the browser of each screen in the mosque. It shows the clock, today&apos;s times and
            your announcements, and updates itself.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TvAddressBuilder siteOrigin={siteOrigin} />
        <div>
          <h3 className="text-base font-semibold text-fg">Setting up a screen</h3>
          <ul className="mt-4 flex flex-col gap-5">
            <Tip icon={TvIcon} title="Open it full screen">
              Use the browser&apos;s full-screen or kiosk mode so that only the display shows. On most computers that
              is the F11 key.
            </Tip>
            <Tip icon={ClockIcon} title="Stop the screen going to sleep">
              Turn off sleep, screen savers and power saving on the device, and check that its own clock is right.
            </Tip>
            <Tip icon={WifiOffIcon} title="It keeps working offline">
              Once loaded, the display carries on showing the right times for weeks if the internet drops, and catches
              up by itself when it returns.
            </Tip>
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
