# 🥫 MonsterTracker v2 — Full-Stack

Application complète de suivi de collection de canettes Monster Energy.
Refonte full-stack de la version single-file Firebase d'origine.

## Stack

| Couche    | Technologie                                          |
|-----------|------------------------------------------------------|
| Backend   | Node.js + Express                                    |
| Base      | SQLite (better-sqlite3), WAL, clés étrangères        |
| Auth      | Sessions en base + cookie `httpOnly`/`SameSite=Lax`  |
| MDP       | bcrypt (hachage, cost 10)                            |
| Uploads   | multer → dossier `uploads/` (fichiers, plus de base64) |
| Frontend  | HTML/CSS/JS vanilla (aucun framework, aucun CDN JS)  |
| PWA       | `manifest.json` + `sw.js` (cache réseau d'abord)     |

## Démarrage

```bash
npm install
node seed.js     # crée l'admin + 16 canettes de démo (1 seule fois)
npm start        # http://localhost:3000
```

**Compte admin de démonstration :**
- Email : `admin@monstertracker.fr`
- Mot de passe : `Admin1234!`
- ⚠️ À changer immédiatement en production (Réglages admin).

## Structure

```
monstertracker/
├── server.js          # API REST Express (auth, users, cans, collection,
│                      #   wishlist, favoris, amis, chat, messages, admin…)
├── db.js              # Schéma SQLite + helpers
├── seed.js            # Compte admin + catalogue de démo
├── data/              # monstertracker.db (créé au runtime)
├── uploads/           # Images uploadées (avatars, canettes, pièces jointes)
└── public/
    ├── index.html     # Toute l'UI (landing, auth, app, admin, modales)
    ├── css/style.css
    ├── js/app.js      # Logique front (fetch API, rendu échappé anti-XSS)
    ├── manifest.json  # PWA
    ├── sw.js          # Service Worker
    └── icon.png
```

## Fonctionnalités

**Utilisateur** — inscription/connexion, tableau de bord (stats, valeur,
graphiques série/langue, ajouts récents), catalogue avec recherche, collection
(prix payé + lieu d'achat), wishlist, 3 favoris, amis (recherche, demandes,
acceptation), chat en direct (polling 3 s), notifications (annonces + réponses
admin), paramètres (pseudo, mot de passe, avatar, thème sombre/vert/rouge/bleu),
contact (6 catégories + pièce jointe), suppression de compte avec code de
confirmation **généré côté serveur**, mentions légales.

**Admin** — CRUD canettes (brouillon → publication), éditions limitées, couleur
d'accent, image par upload ou URL, annonces, utilisateurs (recherche,
suppression en cascade), sa propre collection + graphique mensuel, boîte de
réception (filtres, réponses, pièces jointes), mode maintenance (bloque tous
les utilisateurs sauf l'admin), réglages du compte.

## Corrections par rapport à la v1

1. **Séparation front/back** : fini le fichier unique de 1900 lignes.
2. **Plus de clés exposées** : pas de Firebase, tout est sur ton serveur.
3. **Images sur disque** : plus de base64 dans la base (limite 1 Mo/document explosée).
4. **Anti-XSS** : tout contenu dynamique est échappé (`escapeHtml`) ou injecté via `textContent`.
5. **Code mort supprimé** : page de vérification admin (step1/2/3 jamais définis), script Cloudflare résiduel.
6. **Requêtes efficaces** : JOIN SQL à la place des N+1 Firestore ; badges via 1 requête légère.
7. **Rate limiting** sur l'auth (anti brute-force) + validation des entrées côté serveur.
8. **Code de suppression de compte côté serveur** (le captcha client de la v1 était contournable).
9. **UI 100 % française** (la v1 mélangeait FR/EN) + typos corrigées (« freinds »…).
10. **PWA propre** : vrais fichiers `manifest.json`/`sw.js` (au lieu des Blob URLs),
    installation non bloquante.

## API (résumé)

```
POST   /api/auth/register|login|logout      GET /api/auth/me
GET    /api/public/check-username?q=
PATCH  /api/me                              POST /api/me/avatar
POST   /api/me/delete-code                  DELETE /api/me
GET    /api/dashboard  /api/cans  /api/collection  /api/wishlist  /api/favorites
POST   /api/collection  /api/wishlist       DELETE /api/collection/:canId …
GET    /api/friends  /api/users/search?q=   POST /api/friend-requests (+accept/reject)
GET    /api/chats/:friendId                 POST /api/chats/:friendId
GET    /api/badges  /api/updates            POST /api/messages  /api/upload
Admin: /api/admin/cans|updates|users|messages|maintenance|collection-stats
```

## Mise en production (checklist)

- [ ] Changer le mot de passe admin
- [ ] Servir derrière un reverse proxy HTTPS (nginx/Caddy) et passer `secure: true`
      sur le cookie de session (`server.js` → `setSessionCookie`)
- [ ] Sauvegarder `data/monstertracker.db` + `uploads/`
- [ ] Optionnel : `pm2 start server.js` pour le maintien du processus
