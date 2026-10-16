// MonsterTracker — envoi des notifications push (gratuit, sans Cloud Functions)
// Lancé toutes les 10 min par GitHub Actions (.github/workflows/notify.yml).
// Regarde : la version de l'app (settings/appversion) et les annonces (updates).
// Envoie : « Mise à jour disponible » si la version change, « Nouvelle annonce » pour chaque nouvelle.
// Mémoire : document notif_state/main (écrit par le serveur seulement).
// Premier passage : on mémorise l'état SANS rien envoyer (pas de spam au démarrage).
import crypto from 'node:crypto';

const SA = JSON.parse(process.env.FIREBASE_SA || '{}');
if (!SA.private_key) { console.error('FIREBASE_SA manquant ou invalide'); process.exit(1); }
const PROJECT = SA.project_id;
const DB = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FCM = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;
const APP_URL = 'https://batmanmiyuki.github.io/monstertracker/';
const SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging';

const b64u = (b) => Buffer.from(b).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: SA.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${claim}`), SA.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('OAuth refusé : ' + JSON.stringify(j));
  return j.access_token;
}

// Décode le format typé de Firestore REST
function val(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)]));
  return null;
}
const plain = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)]));
const idOf = (d) => d.name.split('/').pop();

async function getDocument(path, tok) {
  const r = await fetch(`${DB}/${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Lecture ${path} : ${r.status} ${await r.text()}`);
  return await r.json();
}

async function listAll(coll, tok) {
  const out = [];
  let pageToken = '';
  do {
    const r = await fetch(`${DB}/${coll}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) throw new Error(`Liste ${coll} : ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...(j.documents || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function saveState(state, tok) {
  const arr = (a) => ({ arrayValue: { values: (a || []).map((x) => ({ stringValue: x })) } });
  const body = {
    fields: {
      last_version: state.last_version ? { stringValue: state.last_version } : { nullValue: null },
      seen_updates: arr(state.seen_updates),
      seen_fr: arr(state.seen_fr),
    },
  };
  const r = await fetch(`${DB}/notif_state/main`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Écriture notif_state : ${r.status} ${await r.text()}`);
}

async function send(token, msg, tok) {
  const r = await fetch(FCM, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data: { title: msg.title, body: msg.body, url: APP_URL, tag: msg.tag },
        webpush: { headers: { Urgency: 'high' }, fcm_options: { link: APP_URL } },
      },
    }),
  });
  if (!r.ok) return { ok: false, status: r.status, text: await r.text() };
  return { ok: true };
}

async function main() {
  const tok = await accessToken();

  const verDoc = await getDocument('settings/appversion', tok);
  const version = verDoc ? plain(verDoc).version || null : null;

  const updates = (await listAll('updates', tok)).map((d) => ({ id: idOf(d), ...plain(d) }));
  const updateIds = updates.map((u) => u.id);

  // demandes d'amis en attente (envoyées à quelqu'un)
  const frs = (await listAll('friend_requests', tok)).map((d) => ({ id: idOf(d), ...plain(d) }))
    .filter((r) => r.status === 'pending' && r.to_uid);
  const frIds = frs.map((r) => r.id);

  const stateDoc = await getDocument('notif_state/main', tok);
  if (!stateDoc) {
    await saveState({ last_version: version, seen_updates: updateIds, seen_fr: frIds }, tok);
    console.log('Premier passage : état mémorisé, aucune notification envoyée.');
    return;
  }
  const st = plain(stateDoc);
  const state = {
    last_version: st.last_version || null,
    seen_updates: Array.isArray(st.seen_updates) ? st.seen_updates : [],
    // 1er passage après cette mise à jour : les demandes déjà en attente sont mémorisées sans envoi
    seen_fr: Array.isArray(st.seen_fr) ? st.seen_fr : frIds,
  };

  // Liste des envois : { msg, tokens } (tokens = appareils du destinataire)
  const sendAll = [];
  const allTokens = async () => [...new Set((await listAll('fcm_tokens', tok)).flatMap((d) => plain(d).tokens || []))];

  if (version && version !== state.last_version) {
    sendAll.push({ msg: { title: 'Mise à jour disponible', body: `La version ${version} est disponible. Ouvre l'app pour mettre à jour.`, tag: 'maj-' + version }, to: null });
  }
  const seenU = new Set(state.seen_updates);
  for (const u of updates.filter((u) => !seenU.has(u.id))) {
    sendAll.push({ msg: { title: 'Nouvelle annonce : ' + (u.title || ''), body: String(u.content || '').slice(0, 140), tag: 'ann-' + u.id }, to: null });
  }
  const seenF = new Set(state.seen_fr);
  for (const r of frs.filter((r) => !seenF.has(r.id))) {
    const from = await getDocument('users/' + r.from_uid, tok);
    const name = from ? (plain(from).username || 'Quelqu\'un') : 'Quelqu\'un';
    sendAll.push({ msg: { title: 'Nouvelle demande d\'ami', body: `${name} veut t'ajouter en ami.`, tag: 'fr-' + r.id }, to: r.to_uid });
  }

  if (sendAll.length === 0) {
    console.log('Rien de nouveau.');
    // on garde l'état à jour même sans envoi (ex : demandes traitées entre-temps)
    await saveState({ last_version: version || state.last_version, seen_updates: [...new Set([...state.seen_updates, ...updateIds])], seen_fr: [...new Set([...state.seen_fr, ...frIds])] }, tok);
    return;
  }

  const everyone = sendAll.some((x) => x.to === null) ? await allTokens() : [];
  console.log(`${sendAll.length} notification(s) à envoyer.`);

  let ok = 0, ko = 0;
  for (const item of sendAll) {
    let targets = everyone;
    if (item.to) {
      const td = await getDocument('fcm_tokens/' + item.to, tok);
      targets = td ? (plain(td).tokens || []) : [];
    }
    for (const t of targets) {
      const res = await send(t, item.msg, tok);
      if (res.ok) ok++; else { ko++; console.warn('Échec envoi :', res.status, res.text.slice(0, 200)); }
    }
  }
  console.log(`Envoyés : ${ok} — échecs : ${ko}`);

  // On mémorise même en cas d'échecs partiels, pour ne pas renvoyer en boucle
  await saveState({
    last_version: version || state.last_version,
    seen_updates: [...new Set([...state.seen_updates, ...updateIds])],
    seen_fr: [...new Set([...state.seen_fr, ...frIds])],
  }, tok);
}

main().catch((e) => { console.error(e); process.exit(1); });
