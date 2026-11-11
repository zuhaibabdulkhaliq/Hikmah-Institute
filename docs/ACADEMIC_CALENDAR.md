# Academic calendar

Open **Academic calendar** from the main navigation. Administrators manage every class; Mushrif manage their assigned sections. Ameer and subject-only teachers do not receive calendar editing access.

## Different teaching weeks for different classes

1. Choose the **Academic year**, **Program** and **Class level**. The matching sections are selected automatically. Uncheck a section if it should follow a different timetable.
2. Choose **Weekly schedule**. Set **Effective from** and **Through** inside that academic year.
3. Select the actual teaching weekdays. Any combination is supported, including all seven days. No weekday is assumed to be a holiday.
4. Enter a reason, select **Preview changes**, review the affected classes and counts, then select **Apply**.

For the institute's examples, select **شام → level 4** and choose **Mon, Tue, Thu, Sat**. Apply, then choose **شام → level 3** and choose **Mon, Wed, Thu, Sat**. Each class keeps its own schedule. Levels with three or five teaching days use their actual selected weekdays; the system does not choose those days for you.

Choose **All programs** and/or **All levels** to apply a shared schedule to several classes. Only checked sections are changed. You can select individual sections even when the filters show many classes. Up to 100 sections can be updated together, in one transaction.

**Copy a saved schedule** copies the weekday selection from another section/year. Your target sections and effective dates stay explicit. New sections do not automatically inherit a previous class's timetable: configure them here after creating them.

## Change a timetable partway through the year

Set the new effective date and end date, select the revised weekdays, then preview and apply. Dates before and after that range keep their previous schedule. The monthly calendar's **Saved weekly schedules** shows the date ranges and offers **Edit schedule**. An edit is limited to the date range displayed in the editor.

Select **Clear weekdays** and confirm **No ordinary teaching days** for a period with no ordinary teaching days, or **All seven days** for a seven-day week. Saved extra teaching-day exceptions still take priority.

## Holidays, vacations and extra teaching days

Select the affected classes, then choose **Holiday / extra day**:

- **Holiday / closed:** no attendance is expected on the date, regardless of the ordinary weekday.
- **Extra teaching day:** attendance counts, including on an ordinary day off.
- **Teaching / event — attendance not counted:** the date remains instructional but is excluded from attendance totals.

For one date, set both date fields to that date. For a vacation or closure, set its start and end dates; every date in the inclusive range receives the exception. Give it a name and reason, preview, then apply. A shared vacation can be applied to all selected programs/levels/sections at once.

Exceptions take priority over weekly schedules and are preserved when a weekly schedule is changed. To cancel an exception, choose **Restore schedule**, select its date range and preview/apply. A saved weekly schedule must cover each exception being restored. Do not turn a cancelled holiday into a teaching day unless it is actually an extra class; restore uses the appropriate weekly day instead.

## Read the monthly calendar

Choose **View section** and **Month**. The calendar shows academic days, days off/holidays, instructional dates without attendance, and unconfigured dates. A dot identifies an exception; a check identifies saved attendance. Click a day to prepare an exception, then check the editor's selected classes before applying it.

The month shows one section. The class checkboxes control the scope of edits. **Take attendance** opens that section's attendance page. The calendar can include future dates; future attendance entry is still prohibited.

## Existing attendance and history

Preview lists planned academic days for the whole selected range, added/removed academic days, preserved exceptions and dates with saved attendance whose counting status would change. If saved attendance is affected, the operator must explicitly acknowledge that effect before applying.

Changes are audited with the operator, reason, previous calendar and resulting dates. Attendance entries are never deleted by calendar edits. Live attendance totals follow the revised academic calendar; existing published results and PDFs remain unchanged. Any official correction follows the existing result-revision process.

The attendance formula remains `(Present + 0.5 × Half) / (eligible academic days − Leave) × 100`. Totals exclude holidays, future dates and dates outside the student's enrollment. Missing/draft attendance stays unmarked and produces **Incomplete**, rather than becoming an absence.

Two people cannot silently overwrite the same preview. If calendars or saved attendance change before Apply, preview again. Closed/archived years can be viewed, but must be explicitly reopened by an administrator before calendar edits.

## Upgrade

Keep the existing private `.env.demo`, font archives and database volume. Update the source, then run:

```sh
bash scripts/demo.sh start
bash scripts/demo.sh test
```

Startup applies migration `011_flexible_academic_calendar.sql`. Existing calendar dates and attendance are retained. Recognizable existing holidays/special days become protected exceptions. No weekly timetable is inferred or enabled automatically. Inspect the new monthly calendar before assigning your institute's actual schedules.
