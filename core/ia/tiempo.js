/** Fase 6 — Reloj y sleep reales, reemplazables en tests (mismo patrón que `generadorAleatorio` de Fase 5). */
export const relojReal = () => Date.now();
export const dormirReal = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
