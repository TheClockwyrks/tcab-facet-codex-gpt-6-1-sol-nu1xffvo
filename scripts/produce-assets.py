"""One-time asset authoring. Build uses the committed outputs, never this script."""
import json, math, subprocess, pathlib, colorsys
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'; TMP=pathlib.Path('/tmp/facet-assets'); TMP.mkdir(exist_ok=True)
def run(tool,*args):
 subprocess.run([tool,*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def write(p,v):
 p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(v))
def line(a,b,c): return {'op':'line','x0':round(a[0]),'y0':round(a[1]),'x1':round(b[0]),'y1':round(b[1]),'color':c}
def poly(points,color):
 ops=[]
 for y in range(math.floor(min(p[1] for p in points)),math.ceil(max(p[1] for p in points))+1):
  hits=[]
  for a,b in zip(points,points[1:]+points[:1]):
   if (a[1]<=y<b[1]) or (b[1]<=y<a[1]): hits.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  hits.sort()
  for i in range(0,len(hits)-1,2):
   x=math.ceil(hits[i]); end=math.floor(hits[i+1]);
   if end>=x:ops.append({'op':'fill_rect','x':x,'y':y,'width':end-x+1,'height':1,'color':color})
 return ops
def render(ops,path,w=64,h=64,sheet=False):
 p=TMP/'art.json'; write(p,ops); path.parent.mkdir(parents=True,exist_ok=True)
 run('draw-sheet' if sheet else 'draw','render','--actions',p,'--out',path,'--width',w,'--height',h,'--no-layers')
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism']
hues=[.96,.06,.135,.40,.50,.61,.76]
shapes=[[(32,4),(53,17),(53,44),(32,60),(11,44),(11,17)],[(16,8),(48,8),(59,32),(48,56),(16,56),(5,32)],[(32,3),(59,32),(32,61),(5,32)],[(18,8),(46,8),(56,20),(56,44),(46,56),(18,56),(8,44),(8,20)],[(32,3),(57,21),(48,52),(16,52),(7,21)],[(32,3),(56,45),(48,56),(16,56),(8,45)],[(20,5),(44,5),(57,32),(44,59),(20,59),(7,32)],[(32,3),(54,16),(58,43),(32,60),(6,43),(10,16)]]
def col(h,v,s=.7):
 r,g,b=colorsys.hsv_to_rgb(h,s,v);return '#%02x%02x%02x'%(int(r*255),int(g*255),int(b*255))
def gem(k,strain=0,turn=0):
 pts=shapes[k]
 if turn:pts=[(32+(x-32)*(.7+.3*math.cos(turn)),y) for x,y in pts]
 inner=[(32+(x-32)*.53,30+(y-30)*.53) for x,y in pts]
 hue=hues[k] if k<7 else .52
 ops=poly(pts,col(hue,.25))
 for i in range(len(pts)):
  j=(i+1)%len(pts);h=hue if k<7 else (i/len(pts)+turn/8)%1
  ops+=poly([pts[i],pts[j],inner[j],inner[i]],col(h,[.95,.65,.42,.30,.55,.84,.72,.4][i],.64))
  ops+=poly([inner[i],inner[j],(31,29)],col(h,[.9,.76,.62,.47,.66,.97,.7,.5][i],.65))
  ops.append(line(inner[i],inner[j],col(h,1,.38)))
 ops += [line(pts[i],pts[(i+1)%len(pts)],col(hue,.66,.35)) for i in range(len(pts))]
 ops += [line((19,18),(27,14),'#fff5db'),line((21,18),(25,18),'#fff5db')]
 cracks=[[(32,8),(29,22),(36,28)],[(36,28),(27,38),(30,51)],[(27,38),(16,34)],[(36,28),(46,39),(50,48)],[(29,22),(18,26)]]
 for path in cracks[:[0,1,3,5][strain]]:
  for a,b in zip(path,path[1:]):
   ops.append(line(a,b,'#061420'));ops.append(line((a[0]+1,a[1]),(b[0]+1,b[1]),'#fff0ca' if strain==3 else '#a6c9cc'))
 if strain==3:
  ops+=poly([(31,7),(35,13),(30,23),(33,33),(26,44),(29,53),(25,52),(24,41),(29,30),(27,23)],'#10121d')
  ops.append(line((31,7),(30,23),'#ffdab0'))
 return ops
for k,name in enumerate(names):
 for s in range(4):render(gem(k,s),OUT/'gems'/f'{name}-{s}.png')
 if k<7:
  for f in range(6):
   if f==0:ops=gem(k,3)
   else:
    ops=[]
    for i,p in enumerate(shapes[k]):
     angle=math.atan2(p[1]-32,p[0]-32);cx=32+math.cos(angle)*(13+f*7);cy=32+math.sin(angle)*(13+f*7)+f*f*.45
     ops+=poly([(cx-5,cy-7),(cx+6,cy-2),(cx+1,cy+6)],col(hues[k],.9-i*.07))
     ops.append(line((cx-4,cy-6),(cx+4,cy-2),'#ffffff'))
   render(ops,OUT/'gems/break'/name/f'{f}.png',sheet=True)
for f in range(12):render(gem(7,turn=f*math.pi/6),OUT/'gems/prism-turn'/f'{f}.png',sheet=True)
ops=[]
for a,b in [((32,3),(58,32)),((58,32),(32,61)),((32,61),(6,32)),((6,32),(32,3))]:ops.append(line(a,b,'#fff3ca'))
for x,y in [(32,7),(55,32),(32,56),(9,32)]:ops+=poly([(x,y-4),(x+3,y),(x,y+4),(x-3,y)],'#ffed9c')
render(ops,OUT/'gems/brilliant.png')
ops=[]
for i in range(8):
 a=i*math.pi/4; x=32+math.cos(a)*27;y=32+math.sin(a)*27
 ops.append(line((32+math.cos(a)*17,32+math.sin(a)*17),(x,y),'#faffff'))
 ops+=poly([(x,y-3),(x+3,y),(x,y+3),(x-3,y)],'#b1fff4')
render(ops,OUT/'gems/star.png')
# Forged metal frame with chamfered edges, inset wells and engraved corner braces.
ops=[]
for n,color in [(0,'#17232d'),(2,'#536d77'),(4,'#192d37'),(8,'#09151e'),(11,'#33525b'),(13,'#101f29')]:
 ops += [ {'op':'stroke_rect','x':n,'y':n,'width':624-2*n,'height':624-2*n,'color':color} ]
for r in range(8):
 for c in range(8):
  x=60+c*72;y=60+r*72
  ops+=poly([(x-31,y-25),(x-25,y-31),(x+25,y-31),(x+31,y-25),(x+31,y+25),(x+25,y+31),(x-25,y+31),(x-31,y+25)],'#0b1923')
  ops.append(line((x-24,y-31),(x+24,y-31),'#243c46'))
  ops.append(line((x-24,y+31),(x+24,y+31),'#122731'))
for x,y in [(12,12),(612,12),(12,612),(612,612)]:
 sx=1 if x<312 else -1;sy=1 if y<312 else -1
 ops+=poly([(x,y),(x+sx*40,y),(x,y+sy*40)],'#a18857')
 ops+=poly([(x+sx*4,y+sy*4),(x+sx*27,y+sy*4),(x+sx*4,y+sy*27)],'#293c42')
render(ops,OUT/'gems/board-frame.png',624,624)
# Authored live systems.
for name,count,speed,size,color in [('clear',12,65,1.7,'#9effee'),('flawed',26,115,2.6,'#ffcf8a'),('cut',22,55,2,'#f9f1c4'),('aura',0,10,.7,'#9ff9ec')]:
 cfg=TMP/f'{name}.json'; write(cfg,{'width':128,'height':128,'duration_ms':1200,'fps':30,'seed':43,'actions':str(TMP/f'{name}-ops.json'),'preview':str(TMP/f'{name}.gif'),'system':str(OUT/'fx'/f'{name}.json')})
 run('particle-2d','--config',cfg,'init')
 run('particle-2d','--config',cfg,'add-emitter','--name','glints','--shape','disc','--x',0,'--y',0,'--radius',23 if name=='aura' else 4,'--rate' if name=='aura' else '--burst',8 if name=='aura' else count,'--lifetime',750,'--speed',speed,'--speed-spread',speed/3,'--cone-angle',180)
 run('particle-2d','--config',cfg,'set-particle','--emitter','glints','--size-from',size,'--size-to',0,'--opacity-from',.8,'--opacity-to',0,'--color-gradient',f'{color}@0,#547aa0@1','--rotation',120)
 run('particle-2d','--config',cfg,'set-forces','--drag',1.3 if name=='aura' else 2.2,'--gravity',0 if name=='aura' else 55,'--turbulence','8,0.06' if name=='aura' else '12,0.035')
 if name=='aura':run('particle-2d','--config',cfg,'set-timeline','--loop','true')
 run('particle-2d','--config',cfg,'render')
# Musical, two-part struck tones with designed pitch gestures.
freqs={'select':880,'swap':660,'refuse':120,'land':90,'flaw':1750,'cut':1320,'levelup':523,'gameover':392}
for i in range(8):freqs[f'chain-{i+1}']=440*2**(i/12)
for name,freq in freqs.items():
 cfg=TMP/f'audio-{name}.json';write(cfg,{'sample_rate':44100,'channels':'stereo','max_duration_ms':650,'seed':42,'actions':str(TMP/'sfxops.json'),'preview':str(TMP/'sfx.png'),'wav':str(OUT/'audio'/f'{name}.wav')})
 run('sfx-synth','--config',cfg,'init')
 for voice,mult,gain,dur in [('body',1,-18,160 if name not in ['levelup','gameover'] else 420),('shine',2.76,-28,90)]:
  run('sfx-synth','--config',cfg,'add-voice','--name',voice,'--wave','triangle' if name=='refuse' else 'sine','--freq',freq*mult,f'--gain={gain}','--dur',dur)
  run('sfx-synth','--config',cfg,'set-pitch','--voice',voice,'--slide-to',freq*mult*(1.6 if name=='levelup' else .55 if name in ['land','gameover','refuse'] else 1.02),'--over',dur)
 if name in ['flaw','land']:
  run('sfx-synth','--config',cfg,'add-voice','--name','snap','--wave','noise','--dur',45,'--gain=-25')
 run('sfx-synth','--config',cfg,'render')
cfg=TMP/'sample.json';write(cfg,{'sample_rate':44100,'channels':'stereo','max_duration_ms':750,'seed':42,'sample_pack':'combat-core','actions':str(TMP/'sampleops.json'),'preview':str(TMP/'sample.png'),'wav':str(OUT/'audio/shatter.wav')})
run('sfx-sample','--config',cfg,'init')
for n,t,g in [('debris_glass',0,-18),('snap_transient',0,-24),('impact_metal_dry',20,-27)]:run('sfx-sample','--config',cfg,'add-sample','--name',n,'--t',t,f'--gain={g}','--fade-out',180)
run('sfx-sample','--config',cfg,'render')
# Two original 16-bar pieces: a hook over shifting arpeggios, and a sparse play ostinato.
for name,tempo in [('title',104),('play',78)]:
 cfg=TMP/f'music-{name}.json';write(cfg,{'sample_rate':22050,'channels':'stereo','max_duration_ms':51000,'seed':42,'instrument_bank':'gm-lite','actions':str(TMP/'musicops.json'),'preview':str(TMP/'music.png'),'wav':str(OUT/'audio'/f'{name}.wav'),'mid':str(OUT/'audio'/f'{name}.mid')})
 run('music','--config',cfg,'init');run('music','--config',cfg,'set-tempo','--bpm',tempo)
 for track,ins in [('hook','music_box'),('bed','vibraphone'),('bass','marimba')]:
  run('music','--config',cfg,'define-track','--name',track,'--instrument',ins)
  run('music','--config',cfg,'set-track-fx','--track',track,'--gain',-18 if name=='title' else -24,'--reverb',.25)
 chords=[[57,60,64,67],[53,57,60,64],[48,52,55,59],[55,59,62,65]]
 motif=[76,79,81,79,76,72,74,76,79,83,81,79,76,74,72,71]
 for bar in range(16):
  chord=chords[(bar//2)%4]
  run('music','--config',cfg,'add-note','--track','bass','--pitch',chord[0]-12,'--t',bar*4,'--dur',2,'--velocity',55)
  for j in range(4):run('music','--config',cfg,'add-note','--track','bed','--pitch',chord[j]+12,'--t',bar*4+j,'--dur',1.6,'--velocity',45)
  for j in range(4 if name=='title' else 2):run('music','--config',cfg,'add-note','--track','hook','--pitch',motif[(bar*4+j)%16],'--t',bar*4+j*(1 if name=='title' else 2),'--dur',.7,'--velocity',65 if name=='title' else 37)
 run('music','--config',cfg,'render')
print('All production assets written.')
# Offline mastering preserves the authored WAVs while bringing the instrument
# bank and quiet sampled debris to a useful game mix. No runtime synthesis.
import wave, struct
for name, target in [('title', .18), ('play', .11), ('shatter', .24)]:
 path=OUT/'audio'/f'{name}.wav'
 with wave.open(str(path),'rb') as source:
  params=source.getparams();raw=source.readframes(source.getnframes())
 samples=struct.unpack('<'+'h'*(len(raw)//2),raw)
 scale=target*32767/max(1,max(abs(v) for v in samples))
 mastered=struct.pack('<'+'h'*len(samples),*(int(max(-32768,min(32767,v*scale))) for v in samples))
 with wave.open(str(path),'wb') as output:
  output.setparams(params);output.writeframes(mastered)
