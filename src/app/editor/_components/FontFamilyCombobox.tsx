import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent } from "react"
import type { FontRegistryEntry } from "@/font-registry"
import { resolveFontEntry } from "@/font-registry"

export function filterFontComboboxOptions(
  options: FontRegistryEntry[],
  query: string,
): FontRegistryEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (normalizedQuery.length === 0) return options
  return options.filter((font) => {
    const searchable = [
      font.key,
      font.displayName,
      font.cssFamily,
      font.docxName,
    ].join(" ").toLocaleLowerCase()
    return searchable.includes(normalizedQuery)
  })
}

export function resolveFontComboboxValue(
  value: string | null | undefined,
  options: FontRegistryEntry[],
): FontRegistryEntry {
  const resolved = resolveFontEntry(value)
  return options.find((font) => font.key === resolved.key) ?? resolved
}

interface FontFamilyComboboxProps {
  value: string | null | undefined
  options: FontRegistryEntry[]
  onChange: (fontFamilyKey: string) => void
  id?: string
  testId?: string
  disabled?: boolean
}

export function FontFamilyCombobox({
  value,
  options,
  onChange,
  id,
  testId = "font-family-combobox",
  disabled = false,
}: FontFamilyComboboxProps) {
  const generatedId = useId()
  const inputId = id ?? `${generatedId}-input`
  const listboxId = `${generatedId}-listbox`
  const selectedFont = resolveFontComboboxValue(value, options)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeKey, setActiveKey] = useState(selectedFont.key)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const filteredOptions = useMemo(() => filterFontComboboxOptions(options, query), [options, query])
  const activeOption = filteredOptions.find((font) => font.key === activeKey) ?? filteredOptions[0]
  const activeOptionId = activeOption ? `${listboxId}-${activeOption.key}` : undefined

  useEffect(() => {
    if (disabled) {
      setOpen(false)
      setQuery("")
      return
    }
    if (!open) return
    searchInputRef.current?.focus()
  }, [disabled, open])

  useEffect(() => {
    if (!open) {
      setActiveKey(selectedFont.key)
      return
    }
    if (filteredOptions.some((font) => font.key === activeKey)) return
    setActiveKey(filteredOptions[0]?.key ?? selectedFont.key)
  }, [activeKey, filteredOptions, open, selectedFont.key])

  function openList() {
    if (disabled) return
    setOpen(true)
    setActiveKey(selectedFont.key)
  }

  function closeList() {
    setOpen(false)
    setQuery("")
    setActiveKey(selectedFont.key)
  }

  function commitFont(font: FontRegistryEntry | undefined) {
    if (!font) return
    onChange(font.key)
    setOpen(false)
    setQuery("")
    setActiveKey(font.key)
    buttonRef.current?.focus()
  }

  function moveActive(delta: number) {
    if (filteredOptions.length === 0) return
    const currentIndex = Math.max(0, filteredOptions.findIndex((font) => font.key === activeKey))
    const nextIndex = (currentIndex + delta + filteredOptions.length) % filteredOptions.length
    setActiveKey(filteredOptions[nextIndex].key)
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openList()
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveActive(1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      moveActive(-1)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      commitFont(activeOption)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      closeList()
      buttonRef.current?.focus()
    }
  }

  return (
    <div
      ref={rootRef}
      style={comboboxRoot}
      onBlur={(event) => {
        if (rootRef.current?.contains(event.relatedTarget as Node | null)) return
        closeList()
      }}
    >
      <button
        ref={buttonRef}
        id={inputId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        data-testid={testId}
        onClick={() => {
          if (disabled) return
          if (open) closeList()
          else openList()
        }}
        onKeyDown={handleButtonKeyDown}
        style={{
          ...comboboxButton,
          background: disabled ? "#f9fafb" : comboboxButton.background,
          color: disabled ? "#94a3b8" : comboboxButton.color,
          cursor: disabled ? "not-allowed" : comboboxButton.cursor,
        }}
      >
        <FontName font={selectedFont} style={selectedName} />
        <span aria-hidden="true" style={chevron}>⌄</span>
      </button>

      {open && (
        <div style={popover} data-testid={`${testId}-popover`}>
          <input
            ref={searchInputRef}
            aria-label="Search font"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            data-testid={`${testId}-search`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search font"
            style={searchInput}
          />
          <div
            id={listboxId}
            role="listbox"
            aria-label="Font family"
            style={optionList}
            data-testid={`${testId}-listbox`}
          >
            {filteredOptions.length === 0 ? (
              <div style={emptyState}>No fonts found</div>
            ) : filteredOptions.map((font) => {
              const selected = font.key === selectedFont.key
              const active = font.key === activeOption?.key
              return (
                <div
                  key={font.key}
                  id={`${listboxId}-${font.key}`}
                  role="option"
                  aria-selected={selected}
                  data-testid={`${testId}-option-${font.key}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitFont(font)}
                  style={{
                    ...optionRow,
                    background: active ? "#eff6ff" : selected ? "#f8fafc" : "#fff",
                    borderColor: active ? "#bfdbfe" : "transparent",
                  }}
                >
                  <FontName font={font} style={optionName} />
                  {selected && <span style={selectedMark}>selected</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function FontName({ font, style }: { font: FontRegistryEntry; style: CSSProperties }) {
  return (
    <span
      style={{
        ...style,
        fontFamily: `"${font.cssFamily}", sans-serif`,
      }}
    >
      {font.displayName}
    </span>
  )
}

const comboboxRoot: CSSProperties = {
  position: "relative",
}

const comboboxButton: CSSProperties = {
  width: "100%",
  minHeight: 34,
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
  padding: "4px 6px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 7,
  textAlign: "left",
  boxSizing: "border-box",
}

const selectedName: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 13,
  color: "#111827",
}

const chevron: CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
  lineHeight: 1,
}

const popover: CSSProperties = {
  position: "absolute",
  zIndex: 20,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  padding: 6,
  border: "1px solid #dbe2ea",
  borderRadius: 6,
  background: "#fff",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
}

const searchInput: CSSProperties = {
  width: "100%",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "5px 6px",
  boxSizing: "border-box",
  fontSize: 11,
  color: "#111827",
  marginBottom: 6,
}

const optionList: CSSProperties = {
  maxHeight: 176,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 2,
}

const optionRow: CSSProperties = {
  border: "1px solid transparent",
  borderRadius: 4,
  padding: "5px 6px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
}

const optionName: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 13,
  color: "#111827",
}

const selectedMark: CSSProperties = {
  fontSize: 9,
  color: "#2563eb",
}

const emptyState: CSSProperties = {
  padding: "8px 6px",
  fontSize: 11,
  color: "#9ca3af",
}
