import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/components/ui/cn";

/** Props of {@link PageNotice}. */
export interface PageNoticeProps {
  /** A small label above the title, e.g. `Error 404`. */
  eyebrow?: string;
  /** What happened, in plain words. It is the page's `<h1>`. */
  title: string;
  /** One or two sentences on what to do about it. */
  description: ReactNode;
  /** Ways out: links and buttons. */
  actions: ReactNode;
  /** A quiet last line, e.g. a reference for the mosque's staff. */
  footnote?: ReactNode;
  /**
   * True when the notice is the whole page (nothing of the site around it):
   * it then fills the window, shows the mark and is the page's `<main>`.
   * False (the default) inside the site's frame, which has both already.
   */
  standalone?: boolean;
}

/**
 * A page that has only a message to give: not found, or something went
 * wrong. Calm, centred, and always with a way back to the prayer times.
 * Works in Server and Client Components.
 */
export function PageNotice({ eyebrow, title, description, actions, footnote, standalone = false }: PageNoticeProps) {
  const body = (
    <div className="mx-auto flex max-w-prose flex-col items-center text-center">
      {standalone ? <LogoMark size={56} /> : null}
      {eyebrow ? (
        <p className={cn("text-xs font-semibold tracking-[0.14em] text-accent-fg uppercase", standalone && "mt-8")}>{eyebrow}</p>
      ) : null}
      <h1 className={cn("font-display text-3xl leading-tight font-semibold tracking-tight text-fg sm:text-4xl", eyebrow ? "mt-2" : standalone && "mt-8")}>
        {title}
      </h1>
      <p className="mt-3 text-lg text-fg-muted">{description}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
      {footnote ? <p className="mt-8 text-sm text-fg-muted">{footnote}</p> : null}
    </div>
  );
  return standalone ? (
    <main className="grid min-h-dvh place-items-center px-gutter py-12">{body}</main>
  ) : (
    <div className="px-gutter py-16 sm:py-24">{body}</div>
  );
}
