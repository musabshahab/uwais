import { CheckIcon } from "@/components/brand/icons";
import { cn } from "@/components/ui/cn";

/** The three steps of an import. */
export type WizardStep = "upload" | "review" | "publish";

const STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "review", label: "Review" },
  { id: "publish", label: "Publish" },
];

/** Props of {@link WizardSteps}. */
export interface WizardStepsProps {
  /** The step the user is on. */
  current: WizardStep;
  /** True once the import has been published: every step is then ticked. */
  finished?: boolean;
}

/** Where the user is in the import: upload, review, publish. */
export function WizardSteps({ current, finished = false }: WizardStepsProps) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  return (
    <ol aria-label="Steps of the import" className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-semibold">
      {STEPS.map((step, index) => {
        const done = finished || index < currentIndex;
        const active = !finished && index === currentIndex;
        return (
          <li key={step.id} aria-current={active ? "step" : undefined} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true" className={cn("h-px w-5 sm:w-10", done || active ? "bg-brand-line" : "bg-line-strong")} /> : null}
            <span
              aria-hidden="true"
              className={cn(
                "numerals grid size-7 place-items-center rounded-full border text-sm",
                done && "border-success-line bg-success-soft text-success-fg",
                active && "border-transparent bg-primary text-on-primary",
                !done && !active && "border-line-strong text-fg-muted",
              )}
            >
              {done ? <CheckIcon size={16} /> : index + 1}
            </span>
            <span className={active || done ? "text-fg" : "text-fg-muted"}>
              {step.label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
