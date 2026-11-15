import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/ui";
import type { PlanTask } from "@/lib/store";
import { CATEGORY_LABEL, type Category } from "@/lib/types";

export function PlanFolders({ categories, tasks, selected, onSelect }: {
  categories: readonly Category[];
  tasks: PlanTask[];
  selected: Category | "all";
  onSelect: (folder: Category | "all") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className="plan-sidebar" aria-labelledby="folder-menu-title">
      <h2 id="folder-menu-title">
        <span className="folder-desktop-title">Plan folders</span>
        <button className="folder-disclosure" type="button" aria-expanded={expanded}
          aria-controls="plan-folder-list" onClick={() => setExpanded(!expanded)}>
          Plan folders <ChevronDown size={17} aria-hidden="true" />
        </button>
      </h2>
      <div id="plan-folder-list" className="plan-folders" data-expanded={expanded}>
        {categories.map(folder => {
          const items = tasks.filter(task => task.category === folder);
          const done = items.filter(task => task.displayStatus === "done").length;
          const active = selected === folder;
          return (
            <button key={folder} type="button" className="plan-folder" aria-pressed={active}
              aria-controls="checklist-content" onClick={() => onSelect(active ? "all" : folder)}>
              <span className="plan-folder-icon"><CategoryIcon category={folder} className="size-[1.15rem]" /></span>
              <span className="plan-folder-label">
                <strong>{CATEGORY_LABEL[folder]}</strong>
                <small>{items.length} {items.length === 1 ? "task" : "tasks"} · {done} done</small>
              </span>
              <ChevronRight className="folder-chevron" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
