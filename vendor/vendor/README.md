# Bibliothèques hébergées avec l'application

Aucune ressource n'est chargée depuis un site tiers (politique de sécurité du navigateur, CSP).
Les empreintes SHA-256 sont dans `SHA256SUMS` et vérifiées à chaque envoi par le contrôle automatique.

| Fichier | Origine | Version |
|---|---|---|
| supabase-js-2.117.3.min.js | npm `@supabase/supabase-js` (dist/umd/supabase.js) | 2.117.3 |
| html2canvas-1.4.1.min.js | npm `html2canvas` (dist/html2canvas.min.js) | 1.4.1 |
| jspdf-2.5.1.umd.min.js | npm `jspdf` (dist/jspdf.umd.min.js) | 2.5.1 |
| fonts/*.woff2 + fonts.css | npm `@fontsource/dm-sans`, `@fontsource/dm-mono` | 5.3.0 |

Mise à jour : télécharger la nouvelle version depuis npm, remplacer le fichier, régénérer `SHA256SUMS`
(`cd vendor && sha256sum *.js fonts/*.woff2 fonts.css > SHA256SUMS`) et relire le changement avant fusion.
