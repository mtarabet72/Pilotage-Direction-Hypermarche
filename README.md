# Pilotage Direction Hypermarché

## Vue d'ensemble
Ce dépôt contient une application web de pilotage opérationnel pour la direction d'un hypermarché. Il permet de gérer les tâches, les indicateurs de performance, les résultats et les exports PDF.

## Objectif de la refonte professionnelle
Le projet a une forte logique fonctionnelle, mais il manque aujourd'hui une architecture plus saine et plus durable. La refonte vise à :
- séparer les contenus, les styles et les scripts ;
- reprendre le système visuel avec un design plus premium ;
- organiser les vues par responsabilité ;
- réutiliser les composants UI ;
- faciliter la maintenance sur le long terme.

## Structure de projet cible

```text
.
├── index.html
├── manifest.json
├── service-worker.js
├── README.md
├── src/
│   ├── app/
│   │   ├── components/
│   │   ├── config/
│   │   ├── core/
│   │   ├── data/
│   │   ├── features/
│   │   ├── services/
│   │   └── utils/
│   ├── scripts/
│   │   └── app.js
│   └── styles/
│       ├── tokens.css
│       ├── base.css
│       ├── components.css
│       └── app.css
├── public/
│   └── assets/
│       ├── icons/
│       └── logos/
└── docs/
    └── architecture.md
```

## Règles d'architecture
- Les styles doivent être séparés des pages HTML.
- Les scripts applicatifs doivent vivre dans `src/scripts/` ou `src/app/`.
- Les composants visuels doivent être réutilisables.
- Les tokens de design doivent être centralisés dans un seul fichier.
- L’interface doit être construite avec des classes cohérentes et des composants standardisés.
- Les fichiers doivent être organisés par responsabilité, pas par hasard.

## Design system recommandé
- palette claire et premium ;
- typographie lisible et hiérarchisée ;
- grille cohérente ;
- composants de base standardisés ;
- états visuels réglés (hover, focus, active, disabled) ;
- navigation plus lisible sur mobile et desktop ;
- cartes de KPI plus élégantes et plus homogènes.

## Étapes de migration
1. Séparer les styles du HTML en fichiers `src/styles`.
2. Migrer la logique JS dans `src/scripts/` et `src/app/`.
3. Créer des composants réutilisables (Header, Sidebar, Cards, Buttons, Modal, Toast).
4. Structurer les vues Dashboard, Tasks, Results, Export, Settings.
5. Mettre en place un design system et un système de tokens.
6. Tester la compatibilité responsive et la stabilité de l’application.

## Standards de qualité
- code lisible,
- variables CSS centralisées,
- classes explicites,
- séparation claire entre UI et logique,
- sans code inline dispersé,
- composants modulaires et maintenables.

## État du dépôt
Le dépôt est actuellement fonctionnel et riche en logique métier, mais il est encore trop monolithique. La refonte en cours vise à garder la valeur métier tout en améliorant la qualité de structure et l’expérience utilisateur.
