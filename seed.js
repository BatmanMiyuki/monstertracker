// ════════════════════════════════════════════════════════════
//  Seed — crée le compte admin et un catalogue de démonstration
//  Usage : node seed.js
// ════════════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const { db } = require('./db');

// ── Compte administrateur ──
const ADMIN_EMAIL = 'admin@monstertracker.fr';
const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'Admin1234!';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
if (!existing) {
  db.prepare(`INSERT INTO users (username, email, password_hash, role, user_code) VALUES (?, ?, ?, 'admin', ?)`)
    .run(ADMIN_USER, ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASS, 10), 'ADMIN01');
  console.log('✓ Compte admin créé :', ADMIN_EMAIL, '/', ADMIN_PASS);
} else {
  console.log('• Compte admin déjà existant.');
}

// ── Canettes de démonstration ──
const canCount = db.prepare('SELECT COUNT(*) AS n FROM cans').get().n;
if (canCount === 0) {
  const demo = [
    { name: 'Monster Energy Original', series: 'Original', variant: null, language: 'FR', cap_color: 'Noir', full_color: 'Noir', volume: '500ml', country: 'France', year: 2020, description: 'La canette iconique, celle par qui tout a commencé.', is_limited: 0, accent_color: '#39ff14' },
    { name: 'Monster Ultra White', series: 'Ultra', variant: 'Zero Sugar', language: 'FR', cap_color: 'Blanc', full_color: 'Blanc', volume: '500ml', country: 'France', year: 2021, description: 'Sans sucre, goût citronné léger.', is_limited: 0, accent_color: '#e8e8e8' },
    { name: 'Monster Ultra Red', series: 'Ultra', variant: 'Sans sucre', language: 'FR', cap_color: 'Rouge', full_color: 'Rouge', volume: '500ml', country: 'France', year: 2021, description: 'Notes de fruits rouges sans sucre.', is_limited: 0, accent_color: '#ff3535' },
    { name: 'Monster Ultra Violet', series: 'Ultra', variant: 'Grape', language: 'EN', cap_color: 'Violet', full_color: 'Violet', volume: '500ml', country: 'Royaume-Uni', year: 2022, description: 'Raisin pétillant, très populaire au Royaume-Uni.', is_limited: 0, accent_color: '#bf5fff' },
    { name: 'Monster Mango Loco', series: 'Juice', variant: 'Mango Loco', language: 'EN', cap_color: 'Jaune', full_color: 'Jaune', volume: '500ml', country: 'Espagne', year: 2019, description: 'Jus de mangue exotique, la plus recherchée en France.', is_limited: 0, accent_color: '#ffc800' },
    { name: 'Monster Pacific Punch', series: 'Juice', variant: 'Pacific Punch', language: 'EN', cap_color: 'Orange', full_color: 'Orange', volume: '500ml', country: 'USA', year: 2020, description: 'Punch tropical importé des États-Unis.', is_limited: 0, accent_color: '#ff9600' },
    { name: 'Monster Khaotic', series: 'Juice', variant: 'Khaotic', language: 'EN', cap_color: 'Orange', full_color: 'Orange', volume: '473ml', country: 'USA', year: 2018, description: 'Agrumes en pagaille. Rare en Europe.', is_limited: 1, accent_color: '#ff9600' },
    { name: 'Monster Pipeline Punch', series: 'Juice', variant: 'Pipeline Punch', language: 'EN', cap_color: 'Rose', full_color: 'Rose', volume: '500ml', country: 'Royaume-Uni', year: 2021, description: 'Fruit de la passion, orange et goyave.', is_limited: 0, accent_color: '#ff6ec7' },
    { name: 'Monster Rehab Tea + Lemonade', series: 'Rehab', variant: 'Tea + Lemonade', language: 'EN', cap_color: 'Vert', full_color: 'Blanc', volume: '458ml', country: 'USA', year: 2019, description: 'Thé glacé et limonade, faible en calories.', is_limited: 0, accent_color: '#00e5a0' },
    { name: 'Monster Ultra Paradise', series: 'Ultra', variant: 'Paradise', language: 'FR', cap_color: 'Vert', full_color: 'Vert clair', volume: '500ml', country: 'France', year: 2022, description: 'Kiwi, citron vert et concombre.', is_limited: 0, accent_color: '#7fff6e' },
    { name: 'Monster Ultra Watermelon', series: 'Ultra', variant: 'Watermelon', language: 'FR', cap_color: 'Vert', full_color: 'Rouge', volume: '500ml', country: 'France', year: 2022, description: 'Pastèque sans sucre.', is_limited: 0, accent_color: '#ff5566' },
    { name: 'Monster Lewis Hamilton #44', series: 'Édition Spéciale', variant: 'F1 Collaboration', language: 'EN', cap_color: 'Noir', full_color: 'Noir/Rouge', volume: '500ml', country: 'Royaume-Uni', year: 2023, description: 'Édition limitée en l’honneur de Lewis Hamilton.', is_limited: 1, accent_color: '#ff3535' },
    { name: 'Monster Ultra Gold', series: 'Ultra', variant: 'Gold', language: 'FR', cap_color: 'Doré', full_color: 'Doré', volume: '500ml', country: 'France', year: 2023, description: 'Notes d’ananas doré, sans sucre.', is_limited: 0, accent_color: '#ffd700' },
    { name: 'Monster Ultra Blue', series: 'Ultra', variant: 'Blueberry', language: 'FR', cap_color: 'Bleu', full_color: 'Bleu', volume: '500ml', country: 'France', year: 2023, description: 'Myrtille sans sucre.', is_limited: 0, accent_color: '#44aaff' },
    { name: 'Monster Java Vanilla Light', series: 'Java', variant: 'Vanilla Light', language: 'EN', cap_color: 'Beige', full_color: 'Beige', volume: '473ml', country: 'USA', year: 2017, description: 'Café latte vanille, rarissime en Europe.', is_limited: 1, accent_color: '#d8c9a3' },
    { name: 'Monster The Doctor VR46', series: 'Édition Spéciale', variant: 'Valentino Rossi', language: 'IT', cap_color: 'Jaune', full_color: 'Jaune/Bleu', volume: '500ml', country: 'Italie', year: 2022, description: 'Collaboration Valentino Rossi, introuvable en France.', is_limited: 1, accent_color: '#ffc800' },
  ];
  const ins = db.prepare(`INSERT INTO cans (name, series, variant, language, cap_color, full_color, volume, country,
    year, description, is_limited, accent_color, is_published) VALUES
    (@name, @series, @variant, @language, @cap_color, @full_color, @volume, @country, @year, @description, @is_limited, @accent_color, 1)`);
  const tx = db.transaction(() => { demo.forEach(c => ins.run(c)); });
  tx();
  console.log('✓ ' + demo.length + ' canettes de démonstration ajoutées (publiées).');
} else {
  console.log('• Catalogue déjà rempli (' + canCount + ' canettes).');
}

// ── Annonce de bienvenue ──
const updCount = db.prepare('SELECT COUNT(*) AS n FROM updates').get().n;
if (updCount === 0) {
  db.prepare('INSERT INTO updates (title, content) VALUES (?, ?)')
    .run('Bienvenue sur MonsterTracker v2 ! 🎉',
      'L’application passe en full-stack : nouveau moteur, base de données SQLite, uploads d’images sur le serveur et interface entièrement en français.\n\nCrée ton compte, explore le catalogue et commence ta collection !');
  console.log('✓ Annonce de bienvenue publiée.');
}

console.log('Seed terminé.');
