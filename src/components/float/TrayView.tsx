import React, { useState } from "react";
import { ShelfView } from "./Shelf";
import { ClipboardView } from "./ClipboardView";

type TraySection = "shelf" | "clipboard";

/** Things you're holding on to: parked files and recent copies. */
export const TrayView: React.FC = () => {
  const [section, setSection] = useState<TraySection>("shelf");

  const switcher = (
    <div className="segmented" role="tablist" aria-label="Tray section">
      {(["shelf", "clipboard"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={section === s}
          className={section === s ? "active" : ""}
          onClick={(e) => {
            e.stopPropagation();
            setSection(s);
          }}
          data-no-drag="true"
        >
          {s === "shelf" ? "Files" : "Clipboard"}
        </button>
      ))}
    </div>
  );

  return section === "shelf" ? <ShelfView header={switcher} /> : <ClipboardView header={switcher} />;
};

export default TrayView;
