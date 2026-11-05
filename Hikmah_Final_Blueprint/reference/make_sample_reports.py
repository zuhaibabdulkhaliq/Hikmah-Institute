from pathlib import Path
import json, html
from weasyprint import HTML
root = Path(__file__).resolve().parents[1]
config = json.loads((root/'examples/shash_mahi_1448_level3_evening_scheme.json').read_text())
expected = json.loads((root/'examples/synthetic_results_expected.json').read_text())['students']
labels = [p['label_ur'] for p in config['papers']]
maxes = [p['max_marks'] for p in config['papers']]
col_header = '<th class="numHead">نمبر شمار</th><th class="name">نام طالب علم</th><th class="att">حاضری<br/>%</th>'
col_header += ''.join(f'<th class="paper">{html.escape(label)}<br/><small>{mx}</small></th>' for label,mx in zip(labels,maxes))
col_header += '<th class="total">مجموعہ<br/>600</th><th>فیصد</th><th>تقدیر</th><th>پوزیشن</th>'
rows = ''
for index,x in enumerate(expected, 1):
    name = 'طالب علم الف' if index==1 else 'طالب علم ب'
    rows += f'<tr><td>{index}</td><td class="name">{name}<small class="ident">({x["student_number"]})</small></td><td>—</td>'
    rows += ''.join(f'<td>{v}</td>' for v in x['marks_rtl'])
    rows += f'<td class="totalcell">{x["total"]}</td><td>{x["percent"]:.1f}</td><td class="pending">منظوری باقی</td><td>—</td></tr>'
for index in range(len(expected)+1,9):
    rows += '<tr><td>'+str(index)+'</td><td>—</td><td>—</td>'+''.join('<td>—</td>' for _ in labels)+'<td>—</td><td>—</td><td>—</td><td>—</td></tr>'
first = expected[0]
group_lines=''.join(f'<tr><td>G{i+1}</td><td>{" + ".join(str(maxes[int(code[1:])-1]) for code in g["paper_codes"])}</td><td>{first["group_totals"][i]} / 100</td></tr>' for i,g in enumerate(config['result_groups']))
css='''
@page sheet {size: A3 landscape; margin: 9mm 9mm 9mm 9mm;}
@page card {size: A4 portrait; margin: 19mm 17mm;}
* {box-sizing:border-box;}
body {font-family:'Noto Kufi Arabic','DejaVu Sans',sans-serif;color:#1c2c44;margin:0;}
.schoolSheet {page:sheet;break-after:page;}
.studentCard {page:card;break-before:page;}
.schoolTitle {text-align:center;color:#0b2867;font-size:18pt;font-weight:900;margin-bottom:1mm;direction:rtl;}
.schoolSubtitle {text-align:center;color:#133d86;font-size:12pt;font-weight:bold; margin:0 0 3mm;direction:rtl;}
.status {text-align:center;font-family:'DejaVu Sans';font-size:7.8pt;color:#8d4b05;margin-bottom:3mm}
.schoolSheet table {border-collapse:collapse;width:100%;table-layout:fixed;text-align:center; direction:rtl; font-size:10.5pt;}
.schoolSheet table th {background:#101820;color:white;border:1px solid #31465c;padding:3mm 1mm;font-size:9pt;line-height:1.65;vertical-align:middle;}
.schoolSheet table td {border:1px solid #8f9eae;height:13.6mm;padding:1mm; font-family:'Noto Kufi Arabic','DejaVu Sans',sans-serif;}
.schoolSheet td.name {font-size:9pt;text-align:right;white-space:nowrap;padding-right:2mm;}
.schoolSheet td.name .ident {display:block;font-size:6.4pt;color:#76889a;direction:ltr;}
.schoolSheet th.paper {width:5.35%;}
.schoolSheet th.name {width:14%;}
.schoolSheet th.numHead {width:3.3%;}
.schoolSheet th.att {width:5.5%;}
.schoolSheet th.total {width:5.5%;}
.schoolSheet th small {color:#d9e7fb;font-family:'DejaVu Sans';font-size:9pt;}
.schoolSheet .totalcell {font-family:'DejaVu Sans';color:#14528b;font-weight:bold;}
.schoolSheet .pending {font-size:7pt;color:#815114;}
.schoolSheet .foot {font-family:'DejaVu Sans';margin-top:5mm;font-size:8.5pt;color:#5e6875;line-height:1.6;}
.studentCard h1 {color:#123e77;font-size:20pt;text-align:center;direction:rtl;margin:0 0 2mm;}
.studentCard h2 {color:#1e527e;text-align:center;font-size:11pt;direction:rtl;margin:0 0 10mm;}
.studentCard .info {border:1px solid #d3dfeb;background:#f3f7fb;padding:5mm;border-radius:3mm;margin-bottom:6mm;line-height:2.2; direction:rtl;font-size:10pt;}
.studentCard table {border-collapse:collapse;width:100%;direction:ltr;font-size:10pt;}
.studentCard th {background:#123e77;color:white;text-align:left;padding:3mm;}
.studentCard td {padding:2.3mm;border-bottom:1px solid #d5e0eb;}
.studentCard .sum {font-size:15pt;font-weight:bold;color:#123e77;direction:ltr;margin-top:6mm;}
.studentCard .disclaimer {font-family:'DejaVu Sans';color:#79491b;border:1px solid #ecd2a1;background:#fff8eb;padding:4mm;font-size:9pt;margin-top:8mm;}
'''
html_doc = f'''<!doctype html><html><head><meta charset="utf-8"/><style>{css}</style></head><body>
<section class="schoolSheet"><div class="schoolTitle">حکمہ انسٹیٹیوٹ — کراچی</div>
<div class="schoolSubtitle">کشف الدرجات ششماہی امتحان 1448 — درجہ: ثالثہ (شام)</div>
<div class="status">SYNTHETIC REPORT PREVIEW - NOT AN OFFICIAL STUDENT MARKSHEET - Grouping still pending institute approval</div>
<table><thead><tr>{col_header}</tr></thead><tbody>{rows}</tbody></table>
<div class="foot">Sample paper maxima (RTL): 33 + 33 + 34 + 34 + 66 + 100 + 66 + 34 + 34 + 66 + 100 = <b>600</b>.
Grades, attendance credits, ambiguous missing marks and official group identities have not been confirmed. All names and marks above are invented.</div></section>
<section class="studentCard"><h1>انفرادی نتیجہ (نمونہ)</h1><h2>ششماہی امتحان 1448 | ثالثہ (شام)</h2>
<div class="info">طالب علم: طالب علم الف<br/>رجسٹریشن: SYN-001<br/>امتحان: ششماہی<br/>حاضری: منظور شدہ پالیسی درکار</div>
<table><thead><tr><th>Proposed 100-mark group</th><th>Paper maxima</th><th>Score</th></tr></thead><tbody>{group_lines}</tbody></table>
<div class="sum">TOTAL: {first['total']} / {first['max_total']} &nbsp; | &nbsp; {first['percent']:.1f}%</div>
<div class="disclaimer">SYNTHETIC PREVIEW ONLY. Grade / rank / attendance are intentionally unassigned pending official institute rules. This page does not reproduce a real pupil's result.</div></section>
</body></html>'''
(root/'reference/sample_reports.html').write_text(html_doc)
HTML(string=html_doc,base_url=str(root)).write_pdf(str(root/'Hikmah_Synthetic_Report_Previews.pdf'))
print('wrote report previews')
