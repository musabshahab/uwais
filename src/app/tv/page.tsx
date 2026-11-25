import { Suspense } from "react";
import { TvDisplay, TvSkeleton } from "@/components/tv";
import { DisplayProvider } from "@/lib/client";
import { loadDisplayPayload } from "@/lib/server/data";
import { parseTvOptions, type TvSearchParams } from "@/lib/tv/options";

/** Props Next.js passes to the TV page. */
interface TvPageProps {
  /** The query string, which carries the per-screen options (see `parseTvOptions`). */
  searchParams: Promise<TvSearchParams>;
}

/**
 * The request-time part of the TV page: reads this screen's options from the
 * address and the display payload from the database, renders the whole
 * screen on the server, and hands it to `DisplayProvider` to keep it live.
 */
async function TvScreen({ searchParams }: TvPageProps) {
  const [params, payload] = await Promise.all([searchParams, loadDisplayPayload()]);
  return (
    <DisplayProvider initial={payload}>
      <TvDisplay query={parseTvOptions(params)} />
    </DisplayProvider>
  );
}

/**
 * `/tv`: the full-screen display for televisions inside the mosque.
 *
 * Per-screen options go in the address:
 * - `theme=night|day`   colours, instead of the setting from the admin area;
 * - `seconds=0|1`       hide or show the seconds on the clock;
 * - `inset=0..10`       extra margin in percent, for a set that cuts off the edges;
 * - `rotate=0|90|180|270` turn the picture, for a screen mounted sideways or upside down.
 *
 * The page itself is static: it is prerendered as a shell holding the loading
 * placeholder, and the screen streams into it on every request.
 */
export default function TvPage({ searchParams }: TvPageProps) {
  return (
    <Suspense fallback={<TvSkeleton />}>
      <TvScreen searchParams={searchParams} />
    </Suspense>
  );
}
