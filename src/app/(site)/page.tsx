import { Suspense } from "react";
import { HomeSkeleton } from "@/components/site/home/home-skeleton";
import { HomeView } from "@/components/site/home/home-view";
import { MosqueJsonLd } from "@/components/site/json-ld";
import { noScriptReveal } from "@/components/site/no-script";
import { loadDisplayPayload } from "@/lib/server/data";

/**
 * Loads the display payload at request time and hands it to the page. The
 * page renders on the server from the payload first, so the times are in the
 * HTML, and is then kept current in the browser.
 */
async function HomeContent() {
  const payload = await loadDisplayPayload();
  return (
    <div {...noScriptReveal("main")}>
      <MosqueJsonLd settings={payload.settings} />
      <HomeView payload={payload} />
    </div>
  );
}

/**
 * The home page: which prayer is next and how long until it, today's Begins
 * and Jamaat times, a browser for the days around today, tomorrow's changes,
 * Jumu'ah and the announcements.
 *
 * The page itself is static. Its data-driven part streams into a skeleton of
 * the same dimensions. Its title and description come from the site layout's
 * `generateMetadata`, which reads the mosque's name from the settings.
 */
export default function HomePage() {
  return (
    <>
      <h1 className="sr-only">Prayer times</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </>
  );
}
