# Session result sheets and CSV marks upload

Open **Results & reports**, choose a class section and exam session, then use **Session results sheet**. Administrators and the section's assigned Mushrif have access. **Marks entry → Import a full class CSV / open session sheet** is a shortcut for class managers. Subject-only staff keep their assigned-paper access; Ameer have no results/import access.

The result sheet follows the supplied Urdu layout: roll, student, attendance, each separately coded paper and its maximum, total, percentage, approved grade and position. Duplicate subject labels remain separate paper columns. Each session uses that class's actual scheme; paper counts and maxima are not fixed to the example's eleven papers/600 marks.

## Enter marks using the downloadable CSV

1. Select the correct section and exam session.
2. Choose **Download blank marks CSV**. Student numbers, rolls, names and attendance are filled in. Only paper marks are blank. Calculated result columns say `AUTO`.
3. Open the file in Excel, Numbers or another spreadsheet editor. Keep the reference/institute/session rows and column headings. Enter numbers in the paper columns, including an explicit `0` for a scored zero. Keep student numbers as text so leading zeros are not removed.
4. Save as **CSV UTF-8**. Do not upload `.xlsx`, `.numbers`, UTF-16, a PDF, or a result-export CSV.
5. Choose **Completed marks CSV**, enter an import reason, and select **Validate uploaded CSV**.
6. Review the proposed before/after values and every issue. Nothing has been changed yet. Download the validation-errors CSV if useful.
7. If existing entries will change, acknowledge the replacements. Select **Apply validated marks**. All validated changes save together; an error or conflict rolls back the whole batch.

CSV preserves the same wide paper-column structure as the PDF. CSV cannot store colors, merged cells or page layout; the PDF and website carry the formatted black headers and right-to-left presentation.

The standard template contains no blank fields other than paper marks. The protected attendance value may be `N/A` when the period has not been configured or its attendance is incomplete. Attendance is calculated from the calendar and recorded attendance, never imported from a marks file.

## Blank cells, zero and explicit statuses

| Cell value | Effect                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blank      | Keep the existing mark and flags. A never-entered mark stays unresolved.                                                                              |
| `0`        | Save a graded zero.                                                                                                                                   |
| A number   | Save a graded score within that paper's maximum, with at most two decimal places. Urdu/Arabic numerals and the Arabic decimal separator are accepted. |
| `ABSENT`   | Record exam absence; resolution follows the approved missing-mark policy.                                                                             |
| `PENDING`  | Explicitly set the mark to pending, including clearing a previous score after acknowledgement.                                                        |
| `WITHHELD` | Record a withheld mark.                                                                                                                               |
| `EXEMPT`   | Record exemption; the approved policy controls its result treatment.                                                                                  |
| `LEAVE`    | Record an unresolved exam mark with exam leave and not-on-time flags. It is not a scored zero.                                                        |

Unknown/withheld/pending marks remain publication blockers. Red cells show explicit unresolved/absence/leave states; numeric zeros remain ordinary scored cells. Partial totals in a draft are labeled partial, and unresolved rows do not receive a displayed grade, position or numeric result percentage.

## Exam leave and on-time flags

Tick **Include exam leave and on-time columns** before downloading if you also need to enter those facts. The extra columns contain existing values or `NO` / `UNKNOWN`; they are not silently assumed to be on time.

- Exam leave: `YES` or `NO`.
- On time: `YES`, `NO` or `UNKNOWN`.
- A blank optional flag keeps its previous value.
- Leave cannot be marked on time. Later graded concession marks keep their leave/not-on-time status unless an authorized operator explicitly corrects the facts.

With the standard marks-only template, existing flags are preserved and new marks have unconfirmed timing. Confirm timing using the optional columns or the existing paper-entry checkboxes before expecting a position. Position eligibility and approved grade bands continue to come from institute policy; the reference image governs the report layout.

## Validation and conflicts

The server validates the generated template reference, class/session, roster, distinct paper headers and maxima, duplicate or missing students, protected identity cells, valid numeric/status values and exam flags. Formulas, negative/excess marks, excess precision and unknown columns are rejected. UTF-8 BOM and comma/semicolon/tab delimiters are supported when saved from the generated file. Rectangular spreadsheet exports may pad the short reference rows with empty cells and add completely empty final rows; these are accepted. Populated extra reference fields or student rows are still rejected. The limit is 500 students and 500 KB per file.

Blank cells permit partial updates while keeping the complete roster. Do not delete unchanged student rows. Computed total/percentage/grade/position columns are ignored and recalculated; uploaded values cannot set a grade or position.

If a roster or scheme changes, download a fresh template. Filled cells also check their saved mark versions, preventing an old spreadsheet from replacing a newer entry. A preview becomes invalid if its targeted marks, class membership, paper scheme or workflow changes before Apply. A different authorized staff member can use the template, but must create and apply their own preview. Roles and assignments are checked again when applying.

The academic year must be active, the scheme approved, and affected papers open for entry. Reopen submitted papers with a reason under **Marks entry** before correcting them. Applying a CSV does not submit papers, approve marks, approve academic policies or publish results. The import reason, normalized changes and apply action are audited.

## Download results for each session

- **Working marks — draft** shows current data and offers the session's wide CSV and Urdu landscape PDF. It is explicitly labeled non-official.
- **Latest published revision** reads the immutable published snapshot. Importing new working marks cannot change this data.
- **Latest published, otherwise working marks** is the default.

The class PDF uses black paper/maxima headers, white scored cells, blue grade/percentage text, individual paper codes, and roll-number ordering. Large paper lists split into readable panels with repeated identities instead of shrinking eighty columns onto one page. The class result CSV includes every paper, rather than just the old total/grade summary.

Original archived PDFs remain byte-for-byte unchanged. A session sheet formatted from a historical publication uses its frozen data and identifies its publication revision; it does not replace the archived original. Corrected official results still require validation, paper review and publication of a new immutable revision.

## If Validate appears to do nothing

Validation feedback appears beside the upload controls, and the page focuses the errors or preview. Enter an import reason of at least five characters; a missing or short reason now shows an inline error. Validation only prepares a preview: select **Apply validated marks** after reviewing it to save changes.

If an older version hides the error near the top of the session sheet, update the source and rebuild using `bash scripts/demo.sh start`, then reload the page. Preserve your current `.env.demo`, fonts and database volume. You can reselect the same UTF-8 spreadsheet export; there is no need to remove harmless empty padding manually.

## Synthetic examples

- [Sample class result PDF](examples/session-results-synthetic.pdf) and [print preview](images/session-results-print-preview.png).
- Website layouts: [desktop](images/session-results-desktop.png), [iPad width](images/session-results-ipad.png), [mobile width](images/session-results-mobile.png).

These files contain synthetic learners and test-only approved rules. They demonstrate presentation, not institute policy approval. Download a fresh upload template inside the website; template references are bound to the actual class, exam session and saved mark versions.

## Update and verify

Preserve the existing `.env.demo`, local font archives and Docker database volume. Update the source and run `bash scripts/demo.sh start`; startup applies migration `012_session_mark_imports.sql`, adding private template/import records without resetting academic data. No new font package or host Node installation is needed.

Run `bash scripts/demo.sh test` for database/PDF/CSV checks. `scripts/session-sheet-browser-smoke.ts` exercises actual file download/upload, invalid-file review, atomic save, PDF/CSV downloads and acknowledged corrections with synthetic learners. Institute identity, actual grade-band approval, official publication and rollout acceptance remain institute-operated steps.
