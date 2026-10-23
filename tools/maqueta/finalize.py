import json, math, numpy as np
from shapely.geometry import Polygon, LineString, Point, MultiPolygon
from shapely.ops import unary_union, split
d=json.load(open('out/data.json'))
site=Polygon(d['site']['polygon']); FRONT=d['site']['polygon'][0][0]
# ---- centerline: N-S leg quadratic fit on clean samples, fillet arc, W leg straight ----
ns_samples=[(10,32.7),(14,32.11),(18,31.29),(22,30.26),(26,29.07),(42,25.3),(46,23.49),(50,21.0),(54,19.58),(58,18.31)]
ys=np.array([p[0] for p in ns_samples],float); xs=np.array([p[1] for p in ns_samples],float)
q=np.polyfit(ys,xs,2); fx=lambda y: q[0]*y*y+q[1]*y+q[2]
print('quadratic x(y):', np.round(q,5), 'resid', np.round(xs-fx(ys),2))
yW=73.55; wNS=6.3; wW=7.9; vereda=1.5; R=7.5
# tangent at y_t where arc begins: iterate
def dir_at(y):
    dx=2*q[0]*y+q[1]; v=np.array([dx,1.0]); return v/np.linalg.norm(v)
# corner: extend tangent line at y=60 to y=yW
y0=60.0; p0=np.array([fx(y0),y0]); v1=dir_at(y0); xc=p0[0]+v1[0]/v1[1]*(yW-y0); P=np.array([xc,yW]); v2=np.array([1.0,0.0])
ang=math.acos(float(np.dot(-v1,v2))); t=R/math.tan(ang/2)
A=P-v1*t; B=P+v2*t
n1=np.array([v1[1],-v1[0]]); Cc=A+n1*R
a0=math.atan2(A[1]-Cc[1],A[0]-Cc[0]); a1=math.atan2(B[1]-Cc[1],B[0]-Cc[0])
while a1>a0: a1-=2*math.pi
pts=[(fx(10)-(fx(14)-fx(10))*4, -14.0),(fx(10)-(fx(14)-fx(10))*4,-6.0),(fx(10)-(fx(14)-fx(10))*2.5,0.0)]
for y in np.arange(4.0, A[1]-0.01, 2.0): pts.append((float(fx(y)),float(y)))
pts.append((float(A[0]),float(A[1])))
for k in range(1,14):
    th=a0+(a1-a0)*k/14; pts.append((float(Cc[0]+R*math.cos(th)), float(Cc[1]+R*math.sin(th))))
pts.append((float(B[0]),float(B[1])))
# east end: at the vendedor boundary (V6->V1 line) x at y=yW, plus 0.3 beyond
V6=np.array(d['site']['polygon'][5]); V1=np.array(d['site']['polygon'][0])
xe=V6[0]+(yW-V6[1])/(V1[1]-V6[1])*(V1[0]-V6[0])
pts.append((float(xe),yW))
print('A',np.round(A,2),'B',np.round(B,2),'corner',np.round(P,2),'arc deg',round(math.degrees(a0-a1),1),'east end',round(xe,2),'gate x',round(pts[2][0],2))
cl=LineString(pts); iA=pts.index((float(A[0]),float(A[1]))); iB=pts.index((float(B[0]),float(B[1])))
ns_line=LineString(pts[:iA+1]); arc_line=LineString(pts[iA:iB+1]); w_line=LineString(pts[iB:])
def band(w): return unary_union([ns_line.buffer(w/2,cap_style=2), arc_line.buffer(w/2,cap_style=1), w_line.buffer(w/2,cap_style=2)])
calle=unary_union([ns_line.buffer(wNS/2,cap_style=2), arc_line.buffer((wNS+wW)/4,cap_style=1), w_line.buffer(wW/2,cap_style=2)])
corridor=unary_union([ns_line.buffer(wNS/2+vereda,cap_style=2), arc_line.buffer((wNS+wW)/4+vereda,cap_style=1), w_line.buffer(wW/2+vereda,cap_style=2)])
calle_in=calle.intersection(site); corridor_in=corridor.intersection(site)
print('calle area', round(calle_in.area,1), 'corridor', round(corridor_in.area,1))
# ---- lots: site - corridor, split by lot lines ----
cut=[LineString([(0,29.08),(80,29.08)]), LineString([(0,45.72),(80,45.72)]), LineString([(0,64.15),(80,64.15)]), LineString([(-20,23.46),(40,23.46)]),
     LineString([(FRONT-45.43,76.27),(FRONT-50.2,99.05)]), LineString([(-20,7.61),(80,7.61)]), LineString([(-20,7.85),(40,7.85)])]
# tacuaral north edge = corridor edge; keep. front strip east y<7.61, west y<7.85 (cut both; small sliver tolerated)
rem=site.difference(corridor_in)
pieces=[rem]
for ln in cut:
    new=[]
    for pg in pieces:
        try: new.extend(list(split(pg,ln).geoms))
        except Exception: new.append(pg)
    pieces=new
pieces=[p for p in pieces if p.area>3]
table={1:723.03,2:539,3:618.44,4:400,5:380.41,6:511.84,7:500}
lots={}
for l in d['lots']:
    pt=Point(l['label']); cont=[p for p in pieces if p.contains(pt)]
    if cont: lots[l['id']]=max(cont,key=lambda g:g.area)
for k in sorted(lots): print(f"lot {k}: drawn {lots[k].area:7.2f} table {table[k]:7.2f} diff {100*(lots[k].area/table[k]-1):+5.1f}%")
others=[p for p in pieces if not any(p.equals(l) for l in lots.values())]
print('others', [(round(p.area,1), tuple(round(c,1) for c in p.centroid.coords[0])) for p in others])
tac=[p for p in others if 60<p.centroid.y<70]
front=[p for p in others if p.centroid.y<8]
slivers=[p for p in others if p not in tac and p not in front]
def rl(c): return [[round(float(x),3),round(float(y),3)] for x,y in c]
def pc(g): return rl(g.exterior.coords) if g.geom_type=='Polygon' else rl(max(g.geoms,key=lambda p:p.area).exterior.coords)
# merge tiny slivers into adjacent lots (e.g. strip between road and camino-side boundary -> lot 6? keep as 'verde')
d['road'].update({'centerline':rl(pts),'ancho_calle_ns':wNS,'ancho_calle_oeste':wW,'ancho_vereda':vereda,'radio_curva':R,'calle':pc(calle_in),'corridor':pc(corridor_in),'veredas':[pc(g) for g in (corridor_in.difference(calle_in).geoms if corridor_in.difference(calle_in).geom_type=='MultiPolygon' else [corridor_in.difference(calle_in)])],'gate_center_x':round(pts[2][0],2),'i_arc_start':iA,'i_arc_end':iB,'east_end':[round(xe,2),yW],'nota':'Centerline suavizada a partir de los bordes de calle del plano; anchos medidos en el plano (calle 6,3 m en el tramo de acceso, 7,9 m en el tramo del fondo, veredas 1,5 m).'})
d['lots']=[{'id':k,'polygon':pc(lots[k]),'area_plan':table[k],'area_drawn':round(lots[k].area,2),'centroid':[round(float(c),2) for c in lots[k].centroid.coords[0]],'label':next(l['label'] for l in d['lots'] if l['id']==k)} for k in sorted(lots)]
d['tacuaral']=pc(unary_union(tac)) if tac else d['tacuaral']
d['front']['strip']=pc(unary_union(front)) if front else d['front']['strip']
d['verde_extra']=[pc(p) for p in slivers]
# ---- house volumes (hand-defined from the plan's rectangles, final frame) ----
d['house']['volumes']=[
 {'name':'cuerpo principal','x0':45.4,'y0':14.5,'x1':54.7,'y1':24.6,'h':3.45,'floors':1,'nota':'una sola planta, según el render de la arquitecta (10-2026)'},
 {'name':'ala este (quincho / deck seco)','x0':54.7,'y0':15.4,'x1':60.7,'y1':21.9,'h':3.3,'floors':1},
 {'name':'ala norte (cochera)','x0':45.4,'y0':24.6,'x1':52.9,'y1':29.6,'h':3.2,'floors':1},
 {'name':'acceso / pérgola oeste','x0':40.8,'y0':10.8,'x1':45.4,'y1':19.1,'h':3.0,'floors':1,'pergola':True},
 {'name':'cuerpo sur (dormitorios)','x0':48.2,'y0':10.7,'x1':54.8,'y1':14.5,'h':3.3,'floors':1},
]
d['house']['pool']={'x0':61.3,'y0':15.6,'x1':66.3,'y1':21.3,'deck':{'x0':60.8,'y0':14.8,'x1':67.3,'y1':22.3}}
d['house']['driveway']={'from':[34.0,22.0],'to':[45.4,27.0],'width':3.0}
d['front']['gate']['center_x']=round(pts[2][0],2)
d['ruta']['asfalto']={'y0':-7.0,'y1':-14.0,'banquina':[-14.0,-16.0],'verde':[0,-7.0]}
d['camino_vecinal']['ancho']=7.0
json.dump(d, open('out/data.json','w'), ensure_ascii=False, indent=1)
print('data.json updated')
