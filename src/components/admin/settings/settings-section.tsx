import type { ReactNode } from "react";

/** Props of {@link SettingsSection}. */
export interface SettingsSectionProps {
  /** Used for the heading's id, so the summary of errors can link to the section. */
  id: string;
  title: string;
  /** What the section is for, in a sentence or two. */
  description: ReactNode;
  children: ReactNode;
}

/**
 * One section of the settings form: its name and purpose on the left, its
 * fields on the right. On a phone the two stack.
 */
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const headingId = `settings-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="grid scroll-mt-6 gap-x-10 gap-y-5 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    >
      <div>
        <h2 id={headingId} className="text-xl text-fg">
          {title}
        </h2>
        <p className="mt-1.5 text-base text-fg-muted">{description}</p>
      </div>
      <div className="flex max-w-form flex-col gap-5">{children}</div>
    </section>
  );
}
