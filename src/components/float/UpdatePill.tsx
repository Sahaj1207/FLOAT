import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownCircle } from "lucide-react";
import { installUpdate, subscribeToUpdateProgress } from "../../platform";
import { UpdateActivity } from "../../activities/types";
import "./UpdatePill.css";

const swap = { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as const };

/**
 * "FLOAT 2.3 is available" in the island, with Later and Update. Update
 * downloads right here with a progress bar, then opens the installer.
 */
export const UpdatePill: React.FC<{ activity: UpdateActivity; onLater: () => void; onBusy: (busy: boolean) => void }> = ({
  activity,
  onLater,
  onBusy,
}) => {
  const [step, setStep] = useState<"offer" | "downloading" | "opened" | "error">("offer");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let live = true;
    subscribeToUpdateProgress(({ received, total }) => setPercent(total > 0 ? Math.round((received / total) * 100) : 0))
      .then((fn) => {
        if (live) unlisten = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      live = false;
      unlisten?.();
    };
  }, []);

  const update = () => {
    setStep("downloading");
    onBusy(true);
    installUpdate()
      .then(() => setStep("opened"))
      .catch((e) => {
        setStep("error");
        setError(String(e));
      })
      .finally(() => onBusy(false));
  };

  return (
    <div className="update-pill">
      <ArrowDownCircle className="update-pill-icon" strokeWidth={2.2} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={step}
          className="update-pill-text"
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={swap}
          title={step === "error" ? error : undefined}
        >
          {step === "offer" && `FLOAT ${activity.version} is available`}
          {step === "downloading" && `Downloading ${activity.version}…`}
          {step === "opened" && "Installer opened"}
          {step === "error" && "Update failed. Try Settings › Updates"}
        </motion.span>
      </AnimatePresence>
      {step === "offer" && (
        <span className="update-pill-actions">
          <button
            type="button"
            className="update-chip"
            onClick={(e) => {
              e.stopPropagation();
              onLater();
            }}
            data-no-drag="true"
          >
            Later
          </button>
          <button
            type="button"
            className="update-chip primary"
            onClick={(e) => {
              e.stopPropagation();
              update();
            }}
            data-no-drag="true"
          >
            Update
          </button>
        </span>
      )}
      {step === "downloading" && (
        <span className="update-pill-progress" aria-label={`${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </span>
      )}
    </div>
  );
};
