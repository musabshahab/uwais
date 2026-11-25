import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";
import { Spinner } from "./spinner";

/** Visual weight of a button. One `primary` per view; `danger` only for destructive actions. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** `md` is the default and is 44px tall. `sm` is for dense rows and keeps a 44px touch target. */
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex items-center justify-center gap-2 rounded-md font-semibold leading-tight whitespace-nowrap select-none transition-colors duration-fast disabled:opacity-50 disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:shadow-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary shadow-xs hover:bg-primary-hover active:bg-primary-hover",
  secondary: "border border-line-strong bg-surface-raised text-fg hover:bg-surface-sunken active:bg-surface-sunken",
  ghost: "text-fg hover:bg-surface-sunken active:bg-surface-sunken",
  danger: "bg-danger text-on-danger shadow-xs hover:bg-danger-hover active:bg-danger-hover",
};

// The ::after of the small size stretches the hit area to 44px without growing the button.
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
  md: "min-h-control px-4 text-base",
  lg: "min-h-13 px-6 text-lg",
};

const SQUARE_SIZES: Record<ButtonSize, string> = {
  sm: "size-9 after:absolute after:-inset-1 after:content-['']",
  md: "size-control",
  lg: "size-13",
};

/** Options of {@link buttonClasses}. */
export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Equal width and height, for a button that holds only an icon. */
  square?: boolean;
  /** Stretch to the width of the container. */
  fullWidth?: boolean;
}

/**
 * The class list of a button. Exported for the rare element that must look
 * like a button but cannot be rendered by {@link Button} (a `<summary>`, a
 * file-input label).
 */
export function buttonClasses({ variant = "primary", size = "md", square = false, fullWidth = false }: ButtonStyleOptions = {}): string {
  return cn(BASE, VARIANTS[variant], square ? SQUARE_SIZES[size] : SIZES[size], fullWidth && "w-full");
}

/** True for links that leave the app, which must not go through the client router. */
export function isExternalHref(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}

interface ButtonOwnProps {
  /** Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Defaults to `md`. */
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction while work is in progress. */
  loading?: boolean;
  /** Text shown instead of the children while loading, e.g. "Saving". */
  loadingLabel?: string;
  /** Icon before the label. */
  iconStart?: ReactNode;
  /** Icon after the label. */
  iconEnd?: ReactNode;
  /** Stretch to the width of the container. */
  fullWidth?: boolean;
  /** Renders a link that looks like a button. Internal paths use the Next.js router. */
  href?: string;
}

type NativeButtonProps = Omit<ComponentProps<"button">, keyof ButtonOwnProps>;
type NativeAnchorProps = Omit<ComponentProps<"a">, keyof ButtonOwnProps | "type">;

/** Props of {@link Button} when it renders a `<button>`. */
export type ButtonAsButtonProps = ButtonOwnProps & NativeButtonProps & { href?: undefined };

/** Props of {@link Button} when it renders a link (`href` is set). */
export type ButtonAsLinkProps = ButtonOwnProps &
  NativeAnchorProps & {
    href: string;
    /** A link cannot be disabled natively; this removes the `href` and marks it `aria-disabled`. */
    disabled?: boolean;
  };

/** Props of {@link Button}. */
export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function isLinkProps(props: ButtonProps): props is ButtonAsLinkProps {
  return typeof props.href === "string";
}

function ButtonContent({
  loading,
  loadingLabel,
  iconStart,
  iconEnd,
  children,
}: Pick<ButtonOwnProps, "loading" | "loadingLabel" | "iconStart" | "iconEnd"> & { children?: ReactNode }) {
  return (
    <>
      {loading ? <Spinner label={null} /> : iconStart}
      {loading && loadingLabel ? loadingLabel : children}
      {iconEnd}
    </>
  );
}

/**
 * The button. Renders a `<button type="button">` by default, or a link when
 * `href` is given.
 *
 * It is a Server Component: render it anywhere, and pass `onClick` only from
 * Client Components. Set `type="submit"` explicitly for forms.
 *
 * @example <Button type="submit" loading={pending} loadingLabel="Importing">Import timetable</Button>
 * @example <Button href="/timetable" variant="secondary" iconStart={<CalendarIcon />}>Full timetable</Button>
 */
export function Button(props: ButtonProps) {
  if (isLinkProps(props)) {
    const { variant, size, loading = false, loadingLabel, iconStart, iconEnd, fullWidth, href, disabled = false, className, children, ...rest } = props;
    const classes = cn(buttonClasses({ variant, size, fullWidth }), className);
    const content = (
      <ButtonContent loading={loading} loadingLabel={loadingLabel} iconStart={iconStart} iconEnd={iconEnd}>
        {children}
      </ButtonContent>
    );

    if (disabled || loading) {
      return (
        <a role="link" aria-disabled="true" aria-busy={loading || undefined} className={classes} {...rest}>
          {content}
        </a>
      );
    }
    if (isExternalHref(href)) {
      // A page opened in a new tab must not get a handle on this one.
      const rel = rest.target === "_blank" ? cn(rest.rel, "noopener noreferrer") : rest.rel;
      return (
        <a href={href} className={classes} {...rest} rel={rel}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  const { variant, size, loading = false, loadingLabel, iconStart, iconEnd, fullWidth, className, children, type = "button", disabled, ...rest } = props;
  return (
    <button
      type={type}
      // `disabled` rather than aria-disabled while loading: it is the only
      // way to stop a second submit without a click handler, which a Server
      // Component could not attach.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      <ButtonContent loading={loading} loadingLabel={loadingLabel} iconStart={iconStart} iconEnd={iconEnd}>
        {children}
      </ButtonContent>
    </button>
  );
}
