# Démarrage approfondi

## Prérequis

- Un navigateur moderne
- Une connexion internet pour les ressources CDN et éventuellement Supabase
- Un serveur local ou un accès direct à `index.html`

## Lancer l'application

La mise en route la plus simple consiste à ouvrir `index.html` directement dans le navigateur. En environnement local, un petit serveur statique est préférable pour éviter les limites de chargement liées aux modules ES et aux fichiers de traduction.

```bash
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000/
```

## Service worker et manifest PWA

- `manifest.json` fournit les métadonnées de l'application installable.
- `service-worker.js` met en cache les ressources essentielles pour un usage hors ligne.

Le service worker sert à la fois à la persistance de navigation et à la résilience sur les réseaux faibles.

## Migration progressive

### Réalisé

- refonte du modèle de structure vers `src/app/`
- séparation logique par features (`dashboard`, `tasks`, `results`, `export`, `settings`)
- centralisation partielle des tokens dans `src/styles/tokens.css`
- préparation de l'architecture i18n et du support RTL

### Restant

- migration complète des libellés hardcodés
- harmonisation des modules restants vers `data-i18n`
- conversion de toutes les propriétés CSS physiques en propriétés logiques
- audit complet des composants de navigation, modales et toasts en RTL

## Basculer la langue

Le sélecteur de langue est conçu dans le header et persiste dans `localStorage` sous la clé `app.lang`.

- FR => `document.documentElement.lang = 'fr'`
- AR => `document.documentElement.lang = 'ar'`
- le `dir` passe à `ltr` ou `rtl` selon la langue
- le rendu des textes est réappliqué via `applyI18n()`
