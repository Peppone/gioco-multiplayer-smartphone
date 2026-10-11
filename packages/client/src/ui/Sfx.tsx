import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ThemeId } from "@gioco/shared";

/**
 * Onomatopea fumettistica («DON!», «BAM!») che compare per un attimo; solo nel tema manga.
 * Si attiva ogni volta che `trigger` cambia valore (null = nessuna).
 */
export function Sfx({ theme, text, trigger }: { theme: ThemeId; text: string; trigger: string | number | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (theme !== "manga" || trigger === null) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(id);
  }, [theme, trigger]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="sfx"
          aria-hidden
          initial={{ scale: 0.2, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
