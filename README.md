# Pilotage Direction Hypermarché

## Objectif
Ce dépôt contient un outil de pilotage opérationnel pour la direction d'un hypermarché. Il est actuellement structuré comme une application web monopage (SPA) et a été préparé pour être modernisé avec une architecture plus professionnelle.

## Architecture proposée

```text
.
├── index.html                  # page d'entrée de l'application
├── manifest.json               # configuration PWA
├── service-worker.js           # service worker
├── README.md                  # documentation principale
├── src/
│   ├── pages/
│   │   └── README.md          # documentation des pages / vues
│   ├── scripts/
│   │   └── app.js             # bootstrap applicatif et logique de design system
│   └── styles/
│       ├── design-system.css  # tokens, palette, grille, composants
│       └── app.css            # styles spécifiques de l'application
├── assets/
│   └── icons/                 # futurs visuels partagés
└── public/
    └── docs/                  # documents, rapports et exports
```

## Évolution recommandée
- Séparer les feuilles de style dans `src/styles/`
- Séparer les scripts dans `src/scripts/`
- Séparer les vues / pages dans `src/pages/`
- Centraliser les tokens de design dans un système cohérent (`design-system.css`)
- Utiliser des composants réutilisables : cartes, boutons, filtres, badges, modales
- Introduire une naming convention claire et une architecture par responsabilités

## Modernisation UX/UI
Le projet a déjà une base visuelle solide, mais une refonte professionnelle doit inclure :
- palette claire et hiérarchie visuelle forte
- composants standardisés
- spacing cohérent et design tokens
- états visuels (hover, focus, active, disabled)
- responsive design plus strict sur mobile/tablette
- navigation plus lisible et plus premium

## Bonnes pratiques
- Garder `index.html` comme point d'entrée technique
- Migrer progressivement CSS/JS vers `src/styles` et `src/scripts`
- Ajouter des composants partagés pour éviter la duplication
- Gérer les thèmes avec variables CSS
- Préparer les exports PDF / rapports avec un style standardisé

## Prochaines étapes
1. Migrer le CSS inline vers `src/styles/`
2. Migrer le JS inline vers `src/scripts/`
3. Créer une vraie structure multi-vues dans `src/pages/`
4. Refondre le dashboard et les cartes KPI selon un système design moderne
5. Tester la compatibilité mobile et PWA
