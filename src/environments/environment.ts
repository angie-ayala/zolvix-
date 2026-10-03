// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  // ── Groq API (GRATUITO) ────────────────────────────────────────────
  // 1. Ve a https://console.groq.com → regístrate con Google (gratis)
  // 2. API Keys → "Create API key"
  // 3. La key empieza con "gsk_..."
  groqApiKey: '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',

  // ── Servidor propio de IA (opcional) ──────────────────────────────
  // Si tienes un backend propio, pon la URL aquí.
  // Debe recibir POST { message, history } y devolver { reply: "..." }
  apiServerUrl: ''
};
