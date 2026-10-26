# Wiki du projet

## Vue d'ensemble

Ce dépôt contient une application web de pilotage opérationnel pour la direction d'un hypermarché. L'outil centralise les tâches, les KPI, les résultats et les exports PDF, avec un usage prioritaire en environnement directionnel.

Le produit est actuellement fonctionnel et utilise une architecture HTML/CSS/JS vanilla, mais la logique est encore fortement monolithique. La refonte en cours vise à la structuration par features, au design system, et à la prise en charge du bilinguisme AR/FR avec support RTL complet.

## Architecture cible

```text
.
├── index.html
├── manifest.json
├── service-worker.js
├── README.md
├── src/
│   ├── app/
│   │   ├── core/
│   │   ├── features/
│   │   ├── services/
│   │   └── data/
│   ├── i18n/
│   │   ├── fr.json
│   │   ├── ar.json
│   │   └── i18n.js
│   ├── scripts/
│   └── styles/
│       ├── tokens.css
│       ├── base.css
│       └── app.css
├── docs/
│   └── wiki/
├── public/
│   └── assets/
└── supabase-setup.sql
```

## Proposition de valeur

- Pilotage des tâches par secteur, rôle et rayon
- Dashboard de KPI global
- Vérification des résultats par période
- Export PDF pour diffusion interne
- Bilinguisme AR/FR pour les équipes arabophones et francophones

## Public cible et justification du bilinguisme

L'application a vocation à être utilisée par la direction d'un hypermarché, avec un besoin réel de lisibilité côté personnel francophone et arabe. Le bilinguisme n'est pas un simple ajout cosmétique : c'est un prérequis fonctionnel pour les dashboards, les messages d'erreur, les exports et les interactions en contexte de direction.
