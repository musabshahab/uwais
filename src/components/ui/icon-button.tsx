import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";
import { buttonClasses, isExternalHref, type ButtonSize, type ButtonVariant } from "./button";
import { Spinner } from "./spinner";

interface IconButtonOwnProps {
  /** What the button does, e.g. "Delete announcement". It becomes the accessible name and the tooltip. */
  label: string;
  /** The icon. */
  children: ReactNode;
  /** Defaults to `ghost`. */
  variant?: ButtonVariant;
  /** Defaults to `md` (44px). `sm` is 36px with a 44px touch target. */
  size?: ButtonSize;
  /** Shows a spinner instead of the icon and blocks interaction. */
  loading?: boolean;
  /** Renders a link instead of a button. */
  href?: string;
}

/** Props of {@link IconButton} when it renders a `<button>`. */
export type IconButtonAsButtonProps = IconButtonOwnProps &
  Omit<ComponentProps<"button">, keyof IconButtonOwnProps | "aria-label" | "title"> & { href?: undefined };

/** Props of {@link IconButton} when it renders a link (`href` is set). */
export type IconButtonAsLinkProps = IconButtonOwnProps &
  Omit<ComponentProps<"a">, keyof IconButtonOwnProps | "aria-label" | "title" | "type"> & { href: string };

/** Props of {@link IconButton}. */
export type IconButtonProps = IconButtonAsButtonProps | IconButtonAsLinkProps;

function isLinkProps(props: IconButtonProps): props is IconButtonAsLinkProps {
  return typeof props.href === "string";
}

/**
 * A square button that shows only an icon. `label` is required because an
 * icon alone has no name for screen readers or voice control.
 *
 * @example <IconButton label="Edit Friday 6 March" onClick={edit}><PencilIcon /></IconButton>
 */
export function IconButton(props: IconButtonProps) {
  if (isLinkProps(props)) {
    const { label, children, variant = "ghost", size = "md", loading = false, href, className, ...rest } = props;
    const classes = cn(buttonClasses({ variant, size, square: true }), className);
    const content = loading ? <Spinner label={null} /> : children;
    if (isExternalHref(href)) {
      const rel = rest.target === "_blank" ? cn(rest.rel, "noopener noreferrer") : rest.rel;
      return (
        <a href={href} aria-label={label} title={label} className={classes} {...rest} rel={rel}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} aria-label={label} title={label} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  const { label, children, variant = "ghost", size = "md", loading = false, className, type = "button", disabled, ...rest } = props;
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, square: true }), className)}
      {...rest}
    >
      {loading ? <Spinner label={null} /> : children}
    </button>
  );
}
