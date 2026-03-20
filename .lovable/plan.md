
# Plan — Page README "VR Ultimate" (style Dark & Tech VR)

## Vue d'ensemble
Une page web immersive et esthétique qui présente le README du projet VR Ultimate. Style sombre avec accents néon violet/cyan, navigation par onglets, animations subtiles.

## Design System
- **Palette** : fond `#0a0a0f`, surfaces `#111118`, accents violet `#7c3aed` → cyan `#06b6d4`
- **Typographie** : Inter pour le corps, mono pour les codes
- **Effets** : glows néon sur les accents, gradients, bordures subtiles

## Structure — Onglets de navigation
Barre de navigation fixe en haut avec 6 onglets :

1. **🏠 Aperçu** — Hero avec titre animé, description du projet, tableau de statut avec badges ✅/❌ colorés, deux colonnes (Dashboard vs App VR)
2. **⚡ Démarrage** — Prérequis (4 cards avec icônes : Node.js, ffmpeg, ADB, vérification) + blocs de code bash stylisés (fond noir, prompt `$`, syntaxe colorée)
3. **📦 Installation** — 5 étapes en accordéon/stepper vertical numéroté, chaque étape avec son bloc de code
4. **🎮 Dashboard** — 3 sections (Bibliothèques / Casques / Sync) avec cards, icônes Lucide, descriptions détaillées
5. **🚀 Phases Unity** — Timeline verticale pour les phases 0→6 avec badges d'état (✅ Fait / ⏳ À faire), description de chaque phase
6. **🔧 Référence** — Tableau des APIs (méthode GET/POST avec badges de couleur), structure de fichiers en arbre, dépannage en accordéon

## Composants clés à créer
- `ReadmeNav` : barre onglets sticky avec indicateur actif lumineux
- `CodeBlock` : terminal stylisé avec fond `#0d0d14`, prompt `$` en cyan, commande en blanc, copie au clipboard
- `StatusBadge` : badge ✅/❌ avec couleurs et glow
- `PhaseTimeline` : timeline verticale avec ligne centrale violette, points lumineux, phases complètes vs à faire
- `ApiTable` : tableau avec méthode badge (GET=cyan, POST=violet), hover highlight
- `PrerequisiteCard` : card avec icône, titre, commande de vérification

## Fichiers à créer/modifier
- `src/pages/Index.tsx` → page principale avec état d'onglet actif
- `src/components/readme/` → tous les composants spécifiques
- `src/index.css` → variables de couleur VR dark theme
