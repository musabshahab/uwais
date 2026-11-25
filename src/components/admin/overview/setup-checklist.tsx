import Link from "next/link";
import { CheckIcon, ChevronRightIcon } from "@/components/brand/icons";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import type { SetupStep } from "@/lib/admin/coverage";

const STEP_LINK =
  "inline-flex min-h-control items-center gap-1 rounded-md text-base font-semibold text-brand-fg underline decoration-brand-line underline-offset-4 hover:decoration-current";

/** The number of a step, or a tick once it is done. */
function StepMarker({ index, state }: { index: number; state: SetupStep["state"] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "numerals grid size-9 shrink-0 place-items-center rounded-full border text-base font-semibold",
        state === "done" && "border-success-line bg-success-soft text-success-fg",
        state === "next" && "border-transparent bg-primary text-on-primary",
        state === "later" && "border-line-strong bg-surface-raised text-fg-muted",
      )}
    >
      {state === "done" ? <CheckIcon size={18} /> : index + 1}
    </span>
  );
}

/**
 * The three steps of a new installation, each showing whether it has really
 * been done. Shown on the overview until the mosque's details are saved and
 * a timetable is stored.
 */
export function SetupChecklist({ steps }: { steps: readonly SetupStep[] }) {
  return (
    <Card as="section" aria-labelledby="setup-title">
      <CardHeader>
        <div>
          <CardTitle id="setup-title">Getting started</CardTitle>
          <CardDescription>Three steps to get the website and the screens showing your prayer times.</CardDescription>
        </div>
      </CardHeader>
      <CardBody>
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step.id} className="flex gap-4 border-line py-4 not-last:border-b first:pt-0 last:pb-0">
              <StepMarker index={index} state={step.state} />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-fg">
                  {step.title}
                  {step.state === "done" ? <span className="ml-2 text-sm font-semibold text-success-fg">Done</span> : null}
                </p>
                <p className="text-base text-fg-muted">{step.description}</p>
                {step.external ? (
                  <a href={step.href} target="_blank" rel="noopener" className={STEP_LINK}>
                    {step.action}
                    <span className="sr-only"> (opens in a new tab)</span>
                    <ChevronRightIcon />
                  </a>
                ) : (
                  <Link href={step.href} className={STEP_LINK}>
                    {step.action}
                    <ChevronRightIcon />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
