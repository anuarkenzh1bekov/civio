import { Car, CircleCheck, CircleDashed, GraduationCap, HeartPulse, Receipt, SearchCheck, type LucideIcon } from "lucide-react";
import type { Category, Priority, TaskStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  taxes: Receipt,
  health: HeartPulse,
  vehicle: Car,
  family: GraduationCap,
};

export const CATEGORY_SHORT: Record<Category, string> = {
  taxes: "Taxes",
  health: "Healthcare",
  vehicle: "Vehicle",
  family: "Family",
};

export function CategoryIcon({ category, className = "size-4" }: { category: Category; className?: string }) {
  const Icon = CATEGORY_ICON[category];
  return <Icon className={className} aria-hidden="true" strokeWidth={1.75} />;
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  pending: "bg-surface text-muted border-line",
  needs_verification: "bg-amber-wash text-amber border-transparent",
  done: "bg-moss-wash text-moss border-transparent",
};

const STATUS_ICON: Record<TaskStatus, LucideIcon> = {
  pending: CircleDashed,
  needs_verification: SearchCheck,
  done: CircleCheck,
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}
    >
      <Icon className="size-3.5" aria-hidden="true" strokeWidth={2} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority !== "high") return null;
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-oxblood-wash px-2.5 py-1 text-xs font-semibold text-oxblood">
      High
    </span>
  );
}
