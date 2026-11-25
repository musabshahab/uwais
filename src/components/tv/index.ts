/**
 * The TV display: the full-screen page for televisions inside the mosque.
 * Import from "@/components/tv".
 *
 * `TvDisplay` is the whole screen and must be rendered inside
 * `DisplayProvider` (from "@/lib/client"). `TvSkeleton` is its loading
 * placeholder, and `TvStage` the bare full-screen root that the error screen
 * shares. The styles live in `src/app/tv/tv.css`, which the TV route's
 * layout imports.
 */
export { TvDisplay, type TvDisplayProps } from "./tv-display";
export { TvSkeleton } from "./tv-skeleton";
export { TvFrame, TvStage, type TvFrameProps, type TvStageProps } from "./tv-stage";
