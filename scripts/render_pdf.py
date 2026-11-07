import json,sys,html
from weasyprint import HTML
s=json.load(sys.stdin)
e=lambda v:html.escape(str(v if v is not None else '—'))
n=lambda v:'<span dir="ltr" style="unicode-bidi:isolate;display:inline-block;font-family:DejaVu Sans">'+e(v)+'</span>'
outcome=lambda r:'PASS' if r.get('passing') is True else 'FAIL' if r.get('passing') is False else 'UNRESOLVED'
rows=s['students']
if s.get('enrollment'): rows=[r for r in rows if r['enrollmentId']==s['enrollment']]
individual=bool(s.get('enrollment'))
header=''.join('<th>'+e(p['label'])+'<br>'+n(p['max'])+'</th>' for p in s['scheme']['papers'])
body=''
for i,r in enumerate(rows,1):
 body+='<tr><td>'+n(r['roll'])+'</td><td>'+e(r['name'])+'</td><td>'+n(r['attendance'].get('displayPercent',r['attendance']['percent']))+'</td>'
 body+=''.join('<td>'+n(r['marks'].get(p['code'],{}).get('awarded'))+'</td>' for p in s['scheme']['papers'])
 body+='<td>'+n(str(r['total'])+' / '+str(r['possible']))+'</td><td>'+n(r['displayPercent'])+'</td><td>'+e(r['grade'])+'<br/><small>'+outcome(r)+'</small></td><td>'+n(r['rank'])+'</td></tr>'
 if individual:
  body=''.join('<tr><td>'+e(g['name'])+'</td><td>'+n(str(g['awarded'])+' / '+str(g['possible']))+'</td></tr>' for g in r['groups'])
  header='<th>گروپ</th><th>نمبر</th>'
  body+='<tr><td>مجموعہ</td><td>'+n(str(r['total'])+' / '+str(r['possible']))+' ('+n(r['displayPercent'])+'%)</td></tr>'
  body+='<tr><td>تقدیر / پوزیشن / حاضری</td><td>'+e(r['grade'])+' / '+n(r['rank'])+' / '+n(r['attendance'].get('displayPercent',r['attendance']['percent']))+'</td></tr>'
if individual: body+='<tr><td>Pass status</td><td>'+outcome(rows[0])+'</td></tr>'
head=header if individual else '<th>نمبر</th><th>طالب علم</th><th>حاضری %</th>'+header+'<th>مجموعہ</th><th>فیصد</th><th>تقدیر</th><th>پوزیشن</th>'
css='''@page {size:SIZE;margin:12mm;@bottom-center{content:"صفحہ " counter(page);font-family:"Noto Naskh Arabic";}}body{font-family:"Noto Naskh Arabic","DejaVu Sans";direction:rtl;color:#17372f}h1,h2,p{text-align:center}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}th,td{border:1px solid #a5b5ad;padding:5px;text-align:center;overflow-wrap:anywhere}th{background:#174b3d;color:white}thead{display:table-header-group}tr{break-inside:avoid}footer{margin-top:20px;font-size:10px}'''.replace('SIZE','A4 portrait' if individual else 'A3 landscape')
doc='<meta charset="utf-8"><style>'+css+'</style><h1>'+e(s['institute']['name_ur'] or s['institute']['name'])+'</h1><h2>'+e(s['section']['name'])+' — '+e(s['cycle']['title'])+' — '+e(s['year']['label'])+'</h2><p>'+('طالب علم: '+e(rows[0]['name'])+' — '+e(rows[0]['studentNumber']) if individual else 'کشف الدرجات')+'</p><p>Revision '+e(s['revision'])+' | '+e(s['publishedAt'])+'</p><table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table><footer>حکمہ انسٹیٹیوٹ — محفوظ شدہ نتیجہ / Immutable published result</footer>'
sys.stdout.buffer.write(HTML(string=doc).write_pdf())
