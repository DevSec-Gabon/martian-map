# Mise en ligne — martian-map.devs-solutions.tech

Site **100 % statique** (HTML, CSS, JS, images). Aucune base de données, aucun
code serveur, aucune dépendance réseau : Leaflet, three.js et les trois polices
sont servis depuis le dossier du site.

Poids total : **18 Mo**, dont 16 Mo de données (imagerie HiRISE, couches,
modèle de terrain).

---

## 1. Ce qui est déjà fait

Le site est **déjà déposé sur le serveur**, dans une zone d'attente qui ne
touche à rien :

| Sur `ged@37.59.100.251` | Contenu |
| --- | --- |
| `~/martian-map.nouveau/` | le site complet (55 fichiers, 18 Mo) |
| `~/martian-map.nginx.conf` | le vhost prêt à installer |
| `~/mise-en-ligne.sh` | le script qui publie et active |

Aucun fichier de `/var/www`, aucun vhost existant et aucune configuration nginx
n'ont été modifiés.

## 2. Ce qu'il reste à faire

**a) Le DNS** (à faire en premier, c'est le plus long à se propager)

Chez le registrar de `devs-solutions.tech`, ajouter :

```
Type   Nom            Valeur
A      martian-map    37.59.100.251
```

Vérifier depuis n'importe où : `nslookup martian-map.devs-solutions.tech`

**b) La publication** (2 minutes, une fois connecté au serveur)

```bash
ssh -i ~/.ssh/veline_vps ged@37.59.100.251
bash ~/mise-en-ligne.sh
```

Le script demande le mot de passe sudo, puis :
1. copie le site dans `/var/www/martian-map` (`ged:www-data`, 755/644) ;
2. installe le vhost et l'active ;
3. lance `nginx -t` — **si la configuration est mauvaise, il s'arrête avant
   de recharger**, les autres sites du serveur ne risquent rien ;
4. recharge nginx (rechargement, pas redémarrage : aucune coupure) ;
5. demande le certificat Let's Encrypt si le DNS répond déjà.

**c) Contrôle**

```bash
curl -sI https://martian-map.devs-solutions.tech/ | head -3
curl -s  https://martian-map.devs-solutions.tech/assets/data/mission.json | head -c 120
```

## 3. Mettre à jour le site plus tard

Depuis le poste de développement, dans le dossier du projet :

```bash
tar -czf - -C site . | ssh -i ~/.ssh/veline_vps ged@37.59.100.251 \
  'rm -rf ~/martian-map.nouveau && mkdir -p ~/martian-map.nouveau && tar -xzf - -C ~/martian-map.nouveau'
ssh -i ~/.ssh/veline_vps ged@37.59.100.251 'bash ~/mise-en-ligne.sh'
```

Le `rsync --delete` du script supprime côté serveur les fichiers retirés.

---

## 4. Point de sécurité — à lire

**Il n'y a plus d'authentification** (non autorisée par le règlement du
concours). L'écran d'entrée propose seulement de choisir un **poste** (équipe
de surface, relais en orbite, contrôle Terre). Le poste règle ce que
l'interface propose (conduire la marche, émettre, écouter) : ce n'est **pas**
une protection, et le site ne sert aucune donnée sensible. Ouvrir `app.html`
directement donne le poste « surface ».

**Langue** : toute l'interface est en anglais (règle de soumission).
`site/assets/data/mission.json` a été traduit à la main : si le pipeline est
relancé, il régénère des textes en français (constantes `CONDITIONS`,
`SOURCES`, `SCIENCE_CIBLES` de `martian_map_pipeline.py`) à traduire aussi.

**La clé SSH privée** (`_prive-acces-vps/veline_vps`) et le mot de passe qui
l'accompagne sont dans le dossier du projet. Ils sont exclus du dépôt par
`.gitignore`, mais **vérifiez avant chaque `git push`** :

```bash
git ls-files | grep -iE 'veline|prive|\.pem$|\.key$'    # doit ne rien afficher
```

Si le dépôt devient public, considérez cette clé comme compromise et
régénérez-la (`ssh-keygen`), puis remplacez-la dans `~/.ssh/authorized_keys`
sur les deux VPS.
