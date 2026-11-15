import { ArrowUp } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import type { US_STATES } from "@/lib/states";
import styles from "./planner.module.css";

type Props = {
  label: string;
  value: string;
  placeholder?: string;
  type: "text" | "date";
  inputMode?: "decimal";
  error: string;
  onChange: (value: string) => void;
  stateMatches?: typeof US_STATES;
  onSelectState: (code: string) => void;
};

export function AnswerInput({ label, value, placeholder, type, inputMode, error, onChange, stateMatches, onSelectState }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const expanded = open && Boolean(stateMatches?.length);
  const active = expanded ? stateMatches?.[activeIndex] : undefined;

  function closeList() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || !stateMatches?.length) return;
    switch (event.key) {
      case "ArrowDown":
        setOpen(true);
        setActiveIndex((activeIndex + 1) % stateMatches.length);
        break;
      case "ArrowUp":
        setOpen(true);
        setActiveIndex(activeIndex <= 0 ? stateMatches.length - 1 : activeIndex - 1);
        break;
      case "Escape":
        if (!expanded) return;
        closeList();
        break;
      case "Enter":
        if (!active) return;
        onSelectState(active.code);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return <>
    <div className={styles.entry}>
      <input
        aria-label={label} aria-invalid={Boolean(error)} aria-describedby={error ? "planner-error" : undefined}
        role={stateMatches ? "combobox" : undefined} aria-autocomplete={stateMatches ? "list" : undefined}
        aria-controls={stateMatches ? listId : undefined} aria-expanded={stateMatches ? expanded : undefined}
        aria-activedescendant={active ? `${listId}-${active.code}` : undefined}
        type={type} inputMode={inputMode} enterKeyHint="go" value={value} placeholder={placeholder} maxLength={90} autoComplete="off"
        onFocus={stateMatches ? () => setOpen(true) : undefined} onBlur={stateMatches ? closeList : undefined}
        onKeyDown={stateMatches ? navigate : undefined}
        onChange={event => {
          onChange(event.target.value);
          if (stateMatches) {
            setOpen(true);
            setActiveIndex(-1);
          }
        }}
      />
      <button type="submit" disabled={!value.trim()} aria-label="Send answer"><ArrowUp size={18} /></button>
    </div>
    {stateMatches && <ul id={listId} className={styles.stateMatches} role="listbox" aria-label="Matching states" hidden={!expanded}>
      {stateMatches.map(state => <li key={state.code} id={`${listId}-${state.code}`} role="option"
        aria-selected={active?.code === state.code} onMouseDown={event => event.preventDefault()}
        onClick={() => onSelectState(state.code)}>
        <span>{state.name}</span><span className={styles.stateCode}>{state.code}</span>
      </li>)}
    </ul>}
  </>;
}
