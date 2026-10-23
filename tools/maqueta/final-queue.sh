#!/bin/sh
# Cola de capturas del visor (sirve el repo en 127.0.0.1:8765): sh final-queue.sh
cd "$(dirname "$0")"; mkdir -p out
export NODE_PATH=/opt/node22/lib/node_modules PATH=/opt/node22/bin:$PATH
O=out/final
shot() { node shot-app.js "$O-$1.png" $2 $3 "$4" ${5:-1800} 2>&1 | tr -d '\n' | sed 's/  */ /g'; echo; }
cam() { echo "PW.app.cam.tTarget.set($1,$2,$3); PW.app.cam.tDist=$4; PW.app.cam.tPhi=$5; PW.app.cam.tTheta=$6; PW.app.cam.tween=null;"; }
shot maqueta 1440 900 ""
shot maqueta-noche 1440 900 "PW.app.setLight('noche')"
shot maqueta-dia 1440 900 "PW.app.setLight('dia')"
shot sel3 1440 900 "PW.app.select(3)"
shot lote1 1440 900 "PW.app.select(1); PW.app.setView('lote')"
shot casa 1440 900 "$(cam 51 2.5 -18 34 1.08 -0.78)"
shot porton-noche 1440 900 "$(cam 32.6 1.6 -6 21 1.32 0.12) PW.app.setLight('noche')"
shot ruta 1440 900 "PW.app.setView('ruta')"
shot plano 1440 900 "PW.app.setView('plano')"
shot dron 1440 900 "PW.app.setView('dron')"
shot bosque-sel5 1440 900 "PW.app.setMode('bosque'); PW.app.select(5)"
shot cotas-sel2 1440 900 "PW.app.select(2); PW.app.setCotas(true)"
shot movil-maqueta 390 844 ""
shot movil-sel3 390 844 "PW.app.select(3)"
shot movil-noche-lote4 390 844 "PW.app.setLight('noche'); PW.app.select(4); PW.app.setView('lote')"
shot tablet-sel6 1024 768 "PW.app.select(6)"
echo FIN
