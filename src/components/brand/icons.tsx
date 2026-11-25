/**
 * The Uwais icon set.
 *
 * Every icon is drawn on the same 24 x 24 grid with a 1.75 stroke, round caps
 * and round joins, and inherits the text colour. They are inline SVG, so they
 * work offline and need no stylesheet. Icons are decorative by default; pass
 * `title` only when an icon is the sole content of something that needs a name
 * (prefer IconButton's `label`).
 */
import type { ComponentProps, ReactNode } from "react";
import { polar, round } from "./geometry";

/** Props shared by every icon. */
export interface IconProps extends Omit<ComponentProps<"svg">, "children" | "viewBox" | "width" | "height"> {
  /** Width and height: pixels or any CSS length. Defaults to `1.25em`, which tracks the surrounding text. */
  size?: number | string;
  /** Accessible name. Without it the icon is hidden from assistive technology. */
  title?: string;
}

/** A component that renders one icon. */
export type IconComponent = (props: IconProps) => ReactNode;

const GRID = 24;

function icon(body: ReactNode): IconComponent {
  return function Icon({ size = "1.25em", title, style, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${GRID} ${GRID}`}
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        focusable="false"
        style={{ flex: "none", ...style }}
        {...rest}
      >
        {body}
      </svg>
    );
  };
}

/** Outline of a cog with `teeth` teeth, centred on the grid. */
function cogPath(teeth: number, tipRadius: number, rootRadius: number): string {
  const centre = GRID / 2;
  const step = 360 / teeth;
  const points: string[] = [];
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const angle = tooth * step;
    const corners = [
      polar(rootRadius, angle - step * 0.3, centre),
      polar(tipRadius, angle - step * 0.17, centre),
      polar(tipRadius, angle + step * 0.17, centre),
      polar(rootRadius, angle + step * 0.3, centre),
    ];
    for (const [x, y] of corners) points.push(`${round(x)} ${round(y)}`);
  }
  return `M${points.join("L")}Z`;
}

/** A dot drawn as a zero-length round-capped stroke, so it matches the stroke weight. */
const dot = (x: number, y: number): string => `M${x} ${y}h.01`;

/** Calendar: dates and the monthly timetable. */
export const CalendarIcon = icon(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>,
);

/** Clock: times and countdowns. */
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);

/** Upload: import a timetable file. */
export const UploadIcon = icon(<path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5M12 15.5V4M7.5 8.5 12 4l4.5 4.5" />);

/** Download: export or save a file. */
export const DownloadIcon = icon(<path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5M12 4v11.5M7.5 11l4.5 4.5 4.5-4.5" />);

/** Install: add the app to this device. */
export const InstallIcon = icon(
  <>
    <rect x="6" y="3" width="12" height="18" rx="2.5" />
    <path d="M12 8v6.5M9.25 11.75 12 14.5l2.75-2.75M10.5 18h3" />
  </>,
);

/** Screen: the TV display. */
export const TvIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8.5 20.5h7M12 17v3.5" />
  </>,
);

/** Cog: settings. */
export const SettingsIcon = icon(
  <>
    <path d={cogPath(8, 9.4, 7.1)} />
    <circle cx="12" cy="12" r="3" />
  </>,
);

/** Megaphone: announcements. */
export const MegaphoneIcon = icon(
  <path d="M4 10v4a1 1 0 0 0 1 1h2.5L16 19V5L7.5 9H5a1 1 0 0 0-1 1ZM7.5 15v3.25a1.75 1.75 0 0 0 3.5 0v-1.6M19 9.5a4 4 0 0 1 0 5" />,
);

/** Check mark: done, selected, success. */
export const CheckIcon = icon(<path d="m5 12.5 5 5L19 7" />);

/** Warning triangle. */
export const WarningIcon = icon(<path d={`M12 4 21 19.5H3L12 4ZM12 10v4.5${dot(12, 17.25)}`} />);

/** Information. */
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d={`M12 11v5.5${dot(12, 7.75)}`} />
  </>,
);

/** Close, dismiss, remove. */
export const CloseIcon = icon(<path d="m6 6 12 12M18 6 6 18" />);

/** Chevron pointing down. */
export const ChevronDownIcon = icon(<path d="m6 9.5 6 6 6-6" />);

/** Chevron pointing up. */
export const ChevronUpIcon = icon(<path d="m6 14.5 6-6 6 6" />);

/** Chevron pointing left: previous day or month. */
export const ChevronLeftIcon = icon(<path d="m14.5 6-6 6 6 6" />);

/** Chevron pointing right: next day or month. */
export const ChevronRightIcon = icon(<path d="m9.5 6 6 6-6 6" />);

/** Sun: daytime, Dhuhr, the light theme. */
export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.75 1.75M16.95 16.95l1.75 1.75M5.3 18.7l1.75-1.75M16.95 7.05l1.75-1.75" />
  </>,
);

/** Sunrise: the sun above the horizon with a rising chevron. */
export const SunriseIcon = icon(
  <path d="M3 18.5h18M7 18.5a5 5 0 0 1 10 0M9.5 5.5 12 3l2.5 2.5M12 3v6.5M4.6 11.6l1.6 1.6M19.4 11.6l-1.6 1.6" />,
);

/** Sunset: the sun on the horizon with a setting chevron (Maghrib). */
export const SunsetIcon = icon(
  <path d="M3 18.5h18M7 18.5a5 5 0 0 1 10 0M9.5 7 12 9.5 14.5 7M12 9.5V3M4.6 11.6l1.6 1.6M19.4 11.6l-1.6 1.6" />,
);

/** Crescent moon: night, Isha, the dark theme. */
export const MoonIcon = icon(<path d="M20 14.6A8.5 8.5 0 1 1 9.4 4a6.8 6.8 0 0 0 10.6 10.6Z" />);

/** Plus: add. */
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);

/** Bin: delete. */
export const TrashIcon = icon(
  <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v5.5M14 11v5.5" />,
);

/** Pencil: edit. */
export const PencilIcon = icon(
  <path d="m4 20 .9-4.4L15.8 4.7a2.2 2.2 0 0 1 3.1 0l.4.4a2.2 2.2 0 0 1 0 3.1L8.4 19.1 4 20ZM13.8 6.7l3.5 3.5" />,
);

/** Door with an arrow: sign out. */
export const LogoutIcon = icon(<path d="M13.5 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6.5M10.5 12H21M17.5 8.5 21 12l-3.5 3.5" />);

/** Three bars: open the navigation menu. */
export const MenuIcon = icon(<path d="M4 7h16M4 12h16M4 17h16" />);

/** Struck-through signal: offline. */
export const WifiOffIcon = icon(
  <path
    d={`M3.64 10.04a13 13 0 0 1 16.72 0M6.54 13.49a8.5 8.5 0 0 1 10.92 0M9.3 16.78a4.2 4.2 0 0 1 5.4 0${dot(12, 19.6)}M4 3.5l16 17`}
  />,
);

/** Arrow leaving a box: opens another site. */
export const ExternalLinkIcon = icon(
  <path d="M13.5 5H19v5.5M19 5l-8.5 8.5M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V9a1.5 1.5 0 0 1 1.5-1.5H11" />,
);

/** Printer: print the timetable. */
export const PrinterIcon = icon(
  <path
    d={`M7 8.5V4h10v4.5M7 16.5H5.5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H17M7 13.5h10V20H7z${dot(17, 11.25)}`}
  />,
);

/** Map pin: the mosque's address and directions. */
export const MapPinIcon = icon(
  <>
    <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </>,
);

/** Handset: phone number. */
export const PhoneIcon = icon(
  <path d="M5.2 4h3.1l1.5 4-2 1.4a11 11 0 0 0 6.8 6.8l1.4-2 4 1.5v3.1A1.2 1.2 0 0 1 18.8 20 14.8 14.8 0 0 1 4 5.2 1.2 1.2 0 0 1 5.2 4Z" />,
);

/** Envelope: email address. */
export const MailIcon = icon(
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>,
);

/** Heart: donations. */
export const HeartIcon = icon(
  <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z" />,
);
