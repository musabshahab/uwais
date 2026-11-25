import { Arabic } from "@/components/ui/arabic";
import { cn } from "@/components/ui/cn";
import "./display.css";

/** Props of {@link PrayerName}. */
export interface PrayerNameProps {
  /** English name, e.g. `Asr` (`row.name`). */
  name: string;
  /** Arabic name, e.g. `العصر` (`row.arabic`); omitted when null or empty. */
  arabic?: string | null;
  /** `inline` puts the Arabic beside the English name (default), `stacked` below it. */
  layout?: "inline" | "stacked";
  /** Size, face and colour of the whole name. */
  className?: string;
  /** Extra classes for the Arabic part, e.g. a colour. */
  arabicClassName?: string;
}

/**
 * The name of a prayer in English with its Arabic name alongside. The Arabic
 * is marked up as Arabic (`lang="ar"`, `dir="rtl"`), so screen readers switch
 * voice and the surrounding left-to-right text is not disturbed. Works in
 * Server and Client Components.
 *
 * @example <PrayerName name={row.name} arabic={row.arabic} className="font-display text-xl" />
 */
export function PrayerName({
  name,
  arabic,
  layout = "inline",
  className,
  arabicClassName,
}: PrayerNameProps) {
  return (
    <span
      className={cn(
        "display-prayer-name",
        layout === "stacked" && "display-prayer-name-stacked",
        className,
      )}
    >
      <span className="display-prayer-name-latin">{name}</span>
      {arabic ? (
        <>
          {/* A real space, so the two names stay two words when read out or copied. */}
          {" "}
          <Arabic className={cn("display-prayer-name-arabic", arabicClassName)}>{arabic}</Arabic>
        </>
      ) : null}
    </span>
  );
}
