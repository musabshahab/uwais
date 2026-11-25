import { LogoMark } from "@/components/brand/logo";
import { TvFrame, TvStage } from "./tv-stage";

/** A no-break space: holds a line of text open. */
const LINE_PLACEHOLDER = "\u00a0";

/** Rows of the placeholder timetable: the five prayers and the smaller sunrise row. */
const SKELETON_ROWS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;

/**
 * The TV display before its data has arrived: the same stage, columns and
 * proportions with quiet blocks where the name, the clock, the timetable
 * rows and the footer band will be, so nothing moves when the real screen
 * replaces it. It is part of the prerendered shell and needs no data.
 */
export function TvSkeleton() {
  return (
    <TvStage>
      <p className="display-sr-only" role="status">
        Loading the prayer times
      </p>
      <TvFrame hidden>
        <div className="tvx-side">
          <div className="tvx-brand">
            <LogoMark size="1em" detail="facets" className="tvx-brand-mark" />
            <span className="tvx-skel tvx-skel-name" />
          </div>
          <div className="tvx-now">
            <span className="tvx-skel tvx-skel-clock" />
            <span className="tvx-skel tvx-skel-date" />
            <span className="tvx-skel tvx-skel-hijri" />
          </div>
          {/* The panel's own lines, empty, so it has its final height in both layouts. */}
          <div className="tvx-next">
            <p className="tv-display tvx-next-label">{LINE_PLACEHOLDER}</p>
            <span className="tv-display tvx-next-count">{LINE_PLACEHOLDER}</span>
          </div>
        </div>
        <div className="tvx-table">
          <div className="tvx-table-head" />
          <div className="tvx-rows">
            {SKELETON_ROWS.map((key) => (
              <div
                key={key}
                className={key === "sunrise" ? "tvx-row tvx-row-minor" : "tvx-row"}
              >
                <span className="tvx-skel tvx-skel-cell-name" />
                <span className="tvx-skel tvx-skel-cell-time" />
                <span className="tvx-skel tvx-skel-cell-time" />
              </div>
            ))}
          </div>
        </div>
        <div className="tvx-band" />
      </TvFrame>
    </TvStage>
  );
}
