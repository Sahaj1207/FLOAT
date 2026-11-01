import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { searchEverything, SearchResult } from "../platform";
import { COLORS, COMMANDS, CustomShortcut, MAX_SHORTCUTS, shortcutList, ShortcutKind, useShortcuts } from "../activities/shortcutsStore";
import { ShortcutGlyph } from "../components/float/Shortcuts";
import "../components/float/AppIcon.css";
import { Group, Popup, Row, Segmented } from "./controls";

const KIND_LABEL: Record<ShortcutKind, string> = { app: "App", url: "Website", path: "Folder or file", command: "FLOAT command" };

const Circle: React.FC<{ shortcut: CustomShortcut }> = ({ shortcut }) => (
  <span
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 30,
      height: 30,
      borderRadius: "50%",
      flexShrink: 0,
      color: "#fff",
      background: shortcut.kind === "app" ? "var(--field)" : shortcut.color,
    }}
  >
    <ShortcutGlyph shortcut={shortcut} size={15} />
  </span>
);

/** Find an app, folder or file with FLOAT's own search. */
const Finder: React.FC<{ kinds: SearchResult["kind"][]; placeholder: string; onPick: (r: SearchResult) => void }> = ({ kinds, placeholder, onPick }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => searchEverything(q, 30, {}).then((r) => setResults(r.filter((x) => kinds.includes(x.kind)).slice(0, 6))), 60);
    return () => clearTimeout(t);
  }, [q, kinds]);
  return (
    <div style={{ width: "100%" }}>
      <input className="sw-field" style={{ width: "100%" }} value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} autoFocus aria-label={placeholder} />
      {results.length > 0 && (
        <div className="sw-menu" style={{ position: "relative", top: 4, right: "auto", animation: "none" }}>
          {results.map((r) => (
            <button key={r.target} type="button" onClick={() => onPick(r)} title={r.target}>
              <span className="check" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.name}
                <span style={{ opacity: 0.55, marginLeft: 8, fontSize: 11.5 }}>{r.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Create or edit one shortcut. */
const Editor: React.FC<{ initial?: CustomShortcut; onClose: () => void }> = ({ initial, onClose }) => {
  const [kind, setKind] = useState<ShortcutKind>(initial?.kind ?? "app");
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial?.target ?? "");
  const [targetLabel, setTargetLabel] = useState(initial ? initial.target : "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);

  const changeKind = (k: ShortcutKind) => {
    setKind(k);
    setTarget(k === "command" ? COMMANDS[0].id : "");
    setTargetLabel("");
    if (k === "command") setName(COMMANDS[0].name);
  };
  const valid = name.trim() && target.trim() && (kind !== "url" || /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}/i.test(target.trim()));
  const save = () => {
    const s = { name: name.trim().slice(0, 24), kind, target: target.trim(), color };
    if (initial) shortcutList.update(initial.id, s);
    else shortcutList.add(s);
    onClose();
  };

  return (
    <Group title={initial ? `Edit “${initial.name}”` : "New shortcut"}>
      <Row label="Does">
        <Segmented value={kind} options={(Object.keys(KIND_LABEL) as ShortcutKind[]).map((k) => [k, KIND_LABEL[k]] as const)} onChange={changeKind} />
      </Row>
      {kind === "app" && (
        <Row label={target ? "App" : "Find an app"} desc={target ? targetLabel : undefined}>
          {!target ? (
            <Finder kinds={["app"]} placeholder="Type an app name, e.g. Teams" onPick={(r) => (setTarget(r.target), setTargetLabel(r.name), setName(name || r.name))} />
          ) : (
            <button type="button" className="sw-btn" onClick={() => setTarget("")}>
              Change…
            </button>
          )}
        </Row>
      )}
      {kind === "path" && (
        <Row label={target ? "Opens" : "Find a folder or file"} desc={target ? targetLabel : undefined}>
          {!target ? (
            <Finder kinds={["folder", "file"]} placeholder="Type a folder or file name" onPick={(r) => (setTarget(r.target), setTargetLabel(r.target), setName(name || r.name))} />
          ) : (
            <button type="button" className="sw-btn" onClick={() => setTarget("")}>
              Change…
            </button>
          )}
        </Row>
      )}
      {kind === "url" && (
        <Row label="Website">
          <input className="sw-field" value={target} placeholder="e.g. mail.google.com" onChange={(e) => setTarget(e.target.value)} aria-label="Website" />
        </Row>
      )}
      {kind === "command" && (
        <Row label="Command">
          <Popup
            label="Command"
            value={target as (typeof COMMANDS)[number]["id"]}
            options={COMMANDS.map((c) => [c.id, c.name] as const)}
            onChange={(id) => {
              const prevName = COMMANDS.find((c) => c.id === target)?.name;
              setTarget(id);
              if (!name || name === prevName) setName(COMMANDS.find((c) => c.id === id)!.name);
            }}
          />
        </Row>
      )}
      <Row label="Name">
        <input className="sw-field" value={name} maxLength={24} placeholder="Shown under the button" onChange={(e) => setName(e.target.value)} aria-label="Name" />
      </Row>
      {kind !== "app" && (
        <Row label="Colour">
          <span style={{ display: "flex", gap: 6 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                style={{ width: 20, height: 20, borderRadius: "50%", border: "none", background: c, boxShadow: c === color ? "0 0 0 2px var(--content), 0 0 0 4px var(--accent)" : "inset 0 0 0 0.5px rgba(0,0,0,.2)" }}
              />
            ))}
          </span>
        </Row>
      )}
      <Row label="">
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="sw-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sw-btn primary" disabled={!valid} onClick={save}>
            {initial ? "Save" : "Add Shortcut"}
          </button>
        </span>
      </Row>
    </Group>
  );
};

export const ShortcutsPage: React.FC = () => {
  const shortcuts = useShortcuts();
  const [editing, setEditing] = useState<CustomShortcut | "new" | null>(null);
  return (
    <>
      <Group foot={`Up to ${MAX_SHORTCUTS}. They appear at the top of Controls in the island, in this order, and search finds them by name.`}>
        {shortcuts.length === 0 && <Row label="No shortcuts yet" desc="Add one below: open an app, a website or a folder, or run a FLOAT command" />}
        {shortcuts.map((s, i) => (
          <Row
            key={s.id}
            label={
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Circle shortcut={s} />
                <span style={{ display: "flex", flexDirection: "column" }}>
                  {s.name}
                  <span className="sw-row-desc">{s.kind === "command" ? COMMANDS.find((c) => c.id === s.target)?.name : KIND_LABEL[s.kind]}</span>
                </span>
              </span>
            }
          >
            <span style={{ display: "flex", gap: 2 }}>
              <button type="button" className="sw-nav-btn" aria-label="Move up" disabled={i === 0} onClick={() => shortcutList.move(s.id, -1)}>
                <ChevronUp size={15} strokeWidth={2.2} />
              </button>
              <button type="button" className="sw-nav-btn" aria-label="Move down" disabled={i === shortcuts.length - 1} onClick={() => shortcutList.move(s.id, 1)}>
                <ChevronDown size={15} strokeWidth={2.2} />
              </button>
              <button type="button" className="sw-nav-btn" aria-label="Edit" onClick={() => setEditing(s)}>
                <Pencil size={14} strokeWidth={2.2} />
              </button>
              <button type="button" className="sw-nav-btn" aria-label="Delete" onClick={() => shortcutList.remove(s.id)}>
                <Trash2 size={14} strokeWidth={2.2} />
              </button>
            </span>
          </Row>
        ))}
      </Group>
      {editing ? (
        <Editor key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      ) : (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="sw-btn primary" disabled={shortcuts.length >= MAX_SHORTCUTS} onClick={() => setEditing("new")}>
            Add Shortcut…
          </button>
        </div>
      )}
    </>
  );
};
