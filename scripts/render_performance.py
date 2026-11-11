import html,json,sys
from weasyprint import HTML
payload=json.load(sys.stdin)
def esc(v): return html.escape(str(v if v is not None else '—'))
def num(v): return '<bdi dir="ltr">'+esc(v)+'</bdi>'
def attendance(a):
 if not a: return '<p>Attendance window not configured.</p>'
 return '<p>Academic days: '+num(a.get('academicDays'))+' · Present: '+num(a.get('present'))+' · Absent: '+num(a.get('absent'))+' · Half: '+num(a.get('half'))+' · Leave: '+num(a.get('leave'))+' · Unmarked: '+num(a.get('unmarked'))+' · Attendance: '+num(a.get('displayPercent'))+'%</p>'
css='''@page{size:A4 portrait;margin:14mm;@bottom-center{content:counter(page);font-family:DejaVu Sans}}body{font-family:"Noto Naskh Arabic","DejaVu Sans";color:#17324d;font-size:11px}h1{color:#087da8;font-size:24px}h2{font-size:18px}h3{color:#087da8}p{line-height:1.7}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #c8dae8;padding:6px;text-align:start;overflow-wrap:anywhere}th{background:#edf5fc}thead{display:table-header-group}tr{break-inside:avoid}section{break-before:page}section:first-child{break-before:auto}.notice{padding:10px;background:#edf5fc;border-radius:10px}bdi{font-family:DejaVu Sans;unicode-bidi:isolate}.small{font-size:9px;color:#5d7188}'''
body=''
for report in payload['students']:
 student=report['student']
 body+='<section><h1>Hikmah Institute · Student performance</h1><h2>'+esc(student['full_name'])+' · '+num(student['student_number'])+'</h2><p>As of '+num(report['asOf'])+'</p>'
 for annual in report.get('academicYears',[]):
  body+='<h2>Whole academic year: '+esc(annual['year'])+'</h2>'+attendance(annual['attendance'])
 for year in report['years']:
  body+='<h2>'+esc(year['year'])+' / '+esc(year['program'])+' / '+esc(year['level'])+' / '+esc(year['section'])+'</h2><h3>Academic-year attendance</h3>'+attendance(year.get('attendance'))
  combined=year['combined']
  body+='<p>Combined recorded marks: '+num(combined['total'])+' / '+num(combined['possible'])+' · '+num(combined['percent'])+'%'+(' · INCOMPLETE' if not combined['complete'] else '')+'</p>'
  for session in year['sessions']:
   result=session['result']
   body+='<h3>'+esc(session['title'])+' · '+('PUBLISHED revision '+num(session['publication']['revision']) if session['official'] else 'DRAFT / NOT AN OFFICIAL PUBLICATION')+'</h3>'+attendance(session.get('attendance'))
   body+='<p>Marks: '+num(result['total'])+' / '+num(result['possible'])+' · '+num(result['percent'])+'% · '+('PASS' if result.get('passing') else 'UNRESOLVED' if not session['complete'] else 'FAIL')+' · Position: '+num(result.get('rank'))+'</p>'
   if session.get('positionReason'): body+='<p class="small">Position eligibility: '+esc(session['positionReason'])+'</p>'
   body+='<table><thead><tr><th>Code / subject</th><th>Marks</th><th>State</th><th>Exam leave</th><th>On time</th></tr></thead><tbody>'
   for p in session['scheme']['papers']:
    m=session['marks'].get(p['code'],{})
    body+='<tr><td>'+esc(p['code'])+' · <span dir="auto">'+esc(p['label'])+'</span></td><td>'+num(m.get('awarded'))+' / '+num(p['max'])+'</td><td>'+esc(m.get('state','PENDING'))+'</td><td>'+('Yes' if m.get('onLeave') else 'No')+'</td><td>'+('Yes' if m.get('onTime') is True else 'No' if m.get('onTime') is False else 'Not confirmed')+'</td></tr>'
   body+='</tbody></table>'
 body+='<p class="notice">'+esc(report['note'])+'</p></section>'
if not payload['students']:body='<h1>Hikmah Institute</h1><p>No enrolled students in this class.</p>'
sys.stdout.buffer.write(HTML(string='<meta charset="utf-8"><style>'+css+'</style>'+body).write_pdf())
