import { createContext } from "react";

// Presentation details live outside the scaled slide canvas.
export const PresentationDetailContext = createContext<HTMLDivElement | null>(null);
