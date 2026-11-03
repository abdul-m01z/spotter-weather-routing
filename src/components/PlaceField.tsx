import { useEffect, useId, useState } from "react";
import { LoaderCircle, MapPin, X } from "lucide-react";
import { request } from "../api";
import type { Place } from "../types";

interface Props {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  error?: string;
}

export function PlaceField({
  label,
  placeholder,
  value,
  onChange,
  error,
}: Props) {
  const id = useId();
  const [query, setQuery] = useState(value?.label || "");
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (value || query.trim().length < 3) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setProblem("");
    setOptions([]);
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await request<{ places: Place[] }>(
          `/api/places?query=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        setOptions(data.places);
        setActive(-1);
        if (!data.places.length)
          setProblem("No locations found. Try a US city or address.");
      } catch (error) {
        if (!controller.signal.aborted)
          setProblem(
            error instanceof Error ? error.message : "Location search failed.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, value]);

  function choose(place: Place) {
    setQuery(place.label);
    onChange(place);
    setOpen(false);
    setProblem("");
  }
  const expanded =
    open && !value && (options.length > 0 || !!problem || loading);
  return (
    <div
      className="field place-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className={`input-shell ${error ? "invalid" : ""}`}>
        <MapPin size={18} aria-hidden="true" />
        <input
          id={id}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            active >= 0 && expanded ? `${id}-${active}` : undefined
          }
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(null);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, options.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && expanded) {
              event.preventDefault();
              if (options[active >= 0 ? active : 0])
                choose(options[active >= 0 ? active : 0]);
            }
          }}
        />
        {loading ? (
          <LoaderCircle size={16} className="spin" aria-label="Searching" />
        ) : (
          query && (
            <button
              type="button"
              className="icon-button clear-place"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                setQuery("");
                onChange(null);
                setProblem("");
              }}
            >
              <X size={15} />
            </button>
          )
        )}
      </div>
      {expanded && (
        <div className="suggestions">
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label={`${label} suggestions`}
          >
            {options.map((option, index) => (
              <li
                key={`${option.coordinate.join(",")}-${index}`}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <MapPin size={15} />
                <span>{option.label}</span>
              </li>
            ))}
          </ul>
          {loading && <p role="status">Finding locations…</p>}
          {problem && <p role="status">{problem}</p>}
        </div>
      )}
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
