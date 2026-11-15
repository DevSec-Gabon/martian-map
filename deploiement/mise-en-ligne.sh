#!/usr/bin/env bash
# ===========================================================================
#  Martian Map — mise en ligne sur devs-solutions.tech
#  À lancer SUR LE SERVEUR, connecté en « ged » :
#      ssh -i ~/.ssh/veline_vps ged@37.59.100.251
#      bash ~/mise-en-ligne.sh
#
#  Le script demande le mot de passe sudo. Il ne touche qu'à ce qui concerne
#  martian-map : il ne modifie aucun autre site du serveur.
# ===========================================================================
set -euo pipefail

DOMAINE="martian-map.devs-solutions.tech"
SOURCE="$HOME/martian-map.nouveau"
CIBLE="/var/www/martian-map"
VHOST="/etc/nginx/sites-available/$DOMAINE"

bleu() { printf '\033[36m%s\033[0m\n' "$*"; }

[ -d "$SOURCE" ] || { echo "Dépôt introuvable : $SOURCE"; exit 1; }

bleu "1/5 · Publication des fichiers dans $CIBLE"
sudo mkdir -p "$CIBLE"
sudo rsync -a --delete "$SOURCE"/ "$CIBLE"/
sudo chown -R ged:www-data "$CIBLE"
sudo find "$CIBLE" -type d -exec chmod 755 {} +
sudo find "$CIBLE" -type f -exec chmod 644 {} +

bleu "2/5 · Installation du vhost"
sudo cp "$HOME/martian-map.nginx.conf" "$VHOST"
sudo ln -sfn "$VHOST" "/etc/nginx/sites-enabled/$DOMAINE"

bleu "3/5 · Vérification de la configuration nginx"
sudo nginx -t

bleu "4/5 · Rechargement (les autres sites ne sont pas coupés)"
sudo systemctl reload nginx

bleu "5/5 · Certificat HTTPS"
echo "Le DNS de $DOMAINE doit déjà pointer vers 37.59.100.251."
if host "$DOMAINE" >/dev/null 2>&1; then
  sudo certbot --nginx -d "$DOMAINE" --non-interactive --agree-tos \
       --redirect -m mayaghagedeon@gmail.com
else
  echo "DNS pas encore résolu. Lancez plus tard :"
  echo "  sudo certbot --nginx -d $DOMAINE --redirect"
fi

bleu "Terminé — http://$DOMAINE"
echo "Contrôle rapide :"
echo "  curl -sI http://$DOMAINE/ | head -3"
echo "  curl -s http://$DOMAINE/assets/data/mission.json | head -c 120; echo"
