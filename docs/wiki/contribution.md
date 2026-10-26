# Normes de code et contribution

## Qualité logicielle

- garder la logique métier séparée de la couche de présentation
- privilégier les composants réutilisables
- centraliser les tokens dans `src/styles/tokens.css`
- éviter le code inline dispersé
- conserver des classes explicites et cohérentes

## Convention i18n

Aucune chaîne visible ne doit rester codée en dur dans le DOM ou les modules JS.

### Règle

Chaque clé visible doit exister au moins dans `fr.json` et `ar.json`.

Exemples de structure :

```json
{
  "nav.dashboard": "Dashboard",
  "tasks.empty_state": "Aucune tâche pour ce filtre.",
  "results.reference": "Date de référence"
}
```

### Bonnes pratiques

- utiliser `data-i18n` pour le texte statique
- utiliser `data-i18n-placeholder` pour les placeholders
- utiliser `data-i18n-title` pour les titres d'éléments interactifs
- utiliser `Intl.DateTimeFormat` et `Intl.NumberFormat` pour les valeurs locales

## Contribution

1. Créer une branche dédiée
2. Modifier uniquement les composants associés
3. Valider le comportement HTML/CSS/JS
4. Vérifier le bon affichage en FR et en AR
5. Tester au moins une vue en mode RTL
