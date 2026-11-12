"""Urdu session matrix; input always comes from an authorized server snapshot."""
import html,re
from decimal import Decimal

def maximum(papers):
    total = sum((Decimal(str(p['max'])) for p in papers), Decimal(0))
    return int(total) if total == total.to_integral() else str(total)

def esc(value):
    return html.escape(str(value if value is not None else '—'))

def number(value):
    return '<bdi dir="ltr" class="number">' + esc(value) + '</bdi>'

def result_sheet_html(s):
    papers = s['scheme']['papers']
    columns = len(papers) + 7
    institute = s['institute'].get('name_ur') or s['institute'].get('official_display_name') or s['institute']['name']
    cycle = s['cycle']
    titles = {'SEH_MAHI': 'سہ ماہی امتحان', 'SHASH_MAHI': 'ششماہی امتحان', 'MOCK': 'مشقی امتحان'}
    title = titles.get(cycle.get('code'), cycle['title']) if cycle['title'] == cycle.get('code') else cycle['title']
    year = s['year'].get('hijri_label') or s['year']['label']
    level = s.get('level') or {}
    program = s.get('program') or {}
    class_name = level.get('name_ur') or level.get('name_en') or s['section']['name']
    if class_name.startswith('درجہ '):
        class_name = class_name[len('درجہ '):]
    class_name += (' (' + program['name'] + ')') if program.get('name') else ''
    class_name += ' · ' + s['section']['code']
    draft = s.get('draft', False)
    state = 'مسودہ — غیر حتمی / DRAFT — NOT AN OFFICIAL RESULT' if draft else 'محفوظ شدہ نتیجہ / PUBLISHED · Revision ' + str(s.get('revision', '—'))
    css = '''
    @page {size:A3 landscape;margin:10mm;@bottom-center{content:"Page " counter(page) " / " counter(pages);font-family:DejaVu Sans;font-size:8pt;}}
    body{font-family:"Noto Naskh Arabic","DejaVu Sans";direction:rtl;color:#080808;margin:0;font-size:12pt}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.55pt solid #555;text-align:center;vertical-align:middle;padding:3mm 1mm;overflow-wrap:anywhere}
    thead{display:table-header-group}tr{break-inside:avoid}th{font-weight:700;background:#000;color:#fff;font-size:12pt;line-height:1.65}
    .institute,.title,.class-name{background:#fff;color:#11116a;font-size:19pt;line-height:1.5;padding:2mm}
    .class-name{font-size:15pt}.identity{background:white;color:black}.maximum{font-size:13pt;padding:1mm}
    .name{text-align:right;font-size:14pt;line-height:1.65}.number{font-family:DejaVu Sans;unicode-bidi:isolate;white-space:nowrap}
    .paper-code{display:block;font-family:DejaVu Sans;font-size:7pt;color:#ddd}.derived{color:#13136e;font-weight:bold}
    .unresolved{background:#ff3030;color:#120000;font-size:9pt}.exempt{background:#eee;font-size:9pt}
    .status{background:#f1f5fa;color:#24344f;font-family:DejaVu Sans;font-size:8pt;padding:2mm}.draft{background:#fff0cf;color:#6e4700;font-weight:700}
    .small{font-size:7.5pt;line-height:1.5}.note{font-size:9pt;margin-top:4mm;line-height:1.8}.partial{display:block;font-size:7pt;color:#555}
    '''
    paper_width = 57 / max(len(papers), 1)
    colgroup = '<col style="width:4%"><col style="width:14%"><col style="width:5%">' + ''.join('<col style="width:' + str(paper_width) + '%">' for _ in papers) + '<col style="width:5%"><col style="width:5%"><col style="width:6%"><col style="width:4%">'
    head = '<tr><th colspan="'+str(columns)+'" class="institute">'+esc(institute)+'</th></tr>'
    head += '<tr><th colspan="3" class="class-name">درجہ: '+esc(class_name)+'</th><th colspan="'+str(columns-3)+'" class="title">کشف الدرجات — '+esc(title)+' '+esc(year)+'</th></tr>'
    head += '<tr><th colspan="'+str(columns)+'" class="status '+('draft' if draft else '')+'">'+esc(state)+'</th></tr>'
    head += '<tr><th rowspan="2" class="identity">نمبر شمار</th><th rowspan="2" class="identity">نام طالب علم</th><th>حاضری</th>'
    head += ''.join('<th>'+esc(p['label'])+'<span class="paper-code">'+esc(p['code'])+'</span></th>' for p in papers)
    head += '<th>مجموعہ</th><th>فیصد</th><th rowspan="2">تقدیر</th><th rowspan="2">پوزیشن</th></tr>'
    head += '<tr><th class="maximum">'+number('100%')+'</th>'+''.join('<th class="maximum">'+number(p['max'])+'</th>' for p in papers)+'<th class="maximum">'+number(s.get('totalMaximum',maximum(papers)))+'</th><th class="maximum">'+number('100%')+'</th></tr>'
    rows = ''
    states = {'PENDING':'نامکمل','UNKNOWN_LEGACY_BLANK':'غیر واضح','ABSENT':'غائب','EXEMPT':'مستثنیٰ','WITHHELD':'محفوظ'}
    positions = {1:'اول',2:'دوم',3:'سوم'}
    def roll_key(student):
        return [(0,int(part)) if part.isdigit() else (1,part.lower()) for part in re.split(r'(\d+)',str(student['roll']))]
    for student in sorted(s['students'],key=roll_key):
        attendance = student.get('attendance') or {}
        percent = attendance.get('displayPercent', attendance.get('percent'))
        if percent is None:
            percent = 'نامکمل' if attendance.get('unmarked') or attendance.get('complete') is False else '—'
        rows += '<tr><td>'+number(student['roll'])+'</td><td class="name">'+esc(student['name'])+'</td><td>'+number(percent)+'</td>'
        for paper in papers:
            mark = student.get('marks',{}).get(paper['code'],{})
            state_value = mark.get('state','PENDING')
            if state_value == 'GRADED' and mark.get('awarded') is not None:
                rows += '<td>'+number(mark['awarded'])+'</td>'
            else:
                label = 'رخصت' if mark.get('onLeave') else states.get(state_value, 'نامکمل')
                rows += '<td class="'+('exempt' if state_value == 'EXEMPT' else 'unresolved')+'">'+esc(label)+'</td>'
        incomplete = bool(student.get('errors'))
        rows += '<td>'+number(student.get('total'))+('<small class="partial">جزوی / Partial</small>' if incomplete else '')+'</td>'
        rows += '<td class="derived">'+number(None if incomplete else student.get('displayPercent'))+'</td><td class="derived">'+esc(None if incomplete else student.get('grade'))+'</td><td>'+esc(None if incomplete else positions.get(student.get('rank'),student.get('rank')))+'</td></tr>'
    if not s['students']:
        rows = '<tr><td colspan="'+str(columns)+'">کوئی اہل طالب علم موجود نہیں / No eligible students</td></tr>'
    footer = '<div class="note">صفر درج شدہ نمبر ہے۔ سرخ خانہ نامکمل، غیر واضح، غیر حاضر یا رخصت کی کیفیت ظاہر کرتا ہے؛ اسے خودکار صفر نہیں سمجھا جاتا۔<br><span dir="ltr">Zero is a graded score. Red cells show explicit unresolved/absence/leave states. Attendance is independent of exam marks.</span>'
    if draft:
        footer += '<br>یہ مسودہ ہے؛ سرکاری نتیجہ صرف منظور شدہ قواعد، مکمل ریکارڈ اور اشاعت کے بعد جاری ہوگا۔'
    else:
        published = str(s.get('publishedAt','')).replace('T',' ')[:16]
        footer += '<br><span dir="ltr">Publication revision '+esc(s.get('revision'))+' · '+esc(published)+' UTC · Original PDF retained in the publication archive.</span>'
    footer += '</div>'
    if s.get('panelCaption'):
        footer += '<p class="small" dir="ltr">'+esc(s['panelCaption'])+'</p>'
    return '<meta charset="utf-8"><style>'+css+'</style><table><colgroup>'+colgroup+'</colgroup><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>'+footer
