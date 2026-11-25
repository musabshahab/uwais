/**
 * The time engine: timezone-safe clock, date arithmetic, display formatting,
 * the Hijri calendar and the prayer state machine. Dependency-free and safe
 * to import from server and client code alike.
 *
 * Every function is pure. The current instant and the timezone are always
 * arguments; nothing in here reads the system clock or the system timezone.
 */

export * from "./dates";
export * from "./format";
export * from "./hijri";
export * from "./schedule";
export * from "./tz";
