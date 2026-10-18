import type { ReactNode } from "react";
import { AnimatePresence, MotionGlobalConfig, type TargetAndTransition, type Transition, motion, useReducedMotion } from "framer-motion";
import type { ThemeId } from "@gioco/shared";

interface ThemeMotion {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
}

/** Transizioni di ingresso e uscita di ogni theme pack. */
const MOTION: Record<ThemeId, ThemeMotion> = {
  // Entra dal basso con una molla, esce verso l'alto.
  gameshow: {
    initial: { opacity: 0, y: 40, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -30, scale: 1.03 },
    transition: { type: "spring", stiffness: 260, damping: 24 },
  },
  // A scatti, come un'animazione a pochi fotogrammi.
  pixel: {
    initial: { opacity: 0, x: -60 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 60 },
    transition: { duration: 0.35, ease: (t: number) => Math.round(t * 5) / 5 },
  },
  // Botto da vignetta: ingrandito e inclinato che si assesta.
  manga: {
    initial: { opacity: 0, scale: 1.3, rotate: -3 },
    animate: { opacity: 1, scale: 1, rotate: 0 },
    exit: { opacity: 0, scale: 0.8, rotate: 3 },
    transition: { duration: 0.22 },
  },
  // Sfocatura da segnale CRT.
  retro80: {
    initial: { opacity: 0, filter: "blur(8px)", x: -20 },
    animate: { opacity: 1, filter: "blur(0px)", x: 0 },
    exit: { opacity: 0, filter: "blur(8px)", x: 20 },
    transition: { duration: 0.3 },
  },
  // Carta che si gira: scatto secco, senza rimbalzi.
  boom: {
    initial: { opacity: 0, scale: 0.9, rotateX: 25 },
    animate: { opacity: 1, scale: 1, rotateX: 0 },
    exit: { opacity: 0, scale: 1.08 },
    transition: { duration: 0.2 },
  },
};

const REDUCED: ThemeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

/** Cambiando `id` il contenuto esce e quello nuovo entra con la transizione del tema. */
export function Stage({ theme, id, children }: { theme: ThemeId; id: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const m = reduce ? REDUCED : MOTION[theme];
  return (
    <AnimatePresence mode="wait">
      {/* Con ?still=1 (animazioni saltate) si nasce già nello stato finale: altrimenti il primo fotogramma mostra lo
          stato iniziale (es. ingrandito e ruotato nel tema manga) e chi misura in quell'istante vede un falso overflow. */}
      <motion.div key={id} initial={MotionGlobalConfig.skipAnimations ? false : m.initial} animate={m.animate} exit={m.exit} transition={m.transition}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
