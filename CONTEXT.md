# Nelson Learning Portal

The delivery and review context for Nelson's dated class materials, homework, and teacher feedback.

## Language

**Taught content**:
Material explicitly reported or directly evidenced as used during a class. It defines the maximum content boundary for that class handout and learner review.
_Avoid_: Prepared content, planned content

**Summary evidence**:
Notes, transcript extracts, or observations that support a post-class summary without proving that their wording or full content was taught.
_Avoid_: Class handout source, taught content

**Teacher Side**:
The teacher-facing portal area for controlling file availability and reviewing Nelson's work.
_Avoid_: Teacher end, admin backend

**File-level answer release**:
A single decision that reveals the approved answers for an entire handout or homework file. Homework release remains unavailable before submission.
_Avoid_: Practice-level reveal, question-by-question answer control

**Matched teacher version**:
An owner-only rendered HTML copy that preserves the learner handout's complete layout, content, order, and response IDs. After each question it presents the answer key first, followed by applicable acceptance criteria, sample answer, annotation guidance, and explanation.
_Avoid_: Detached answer key, Drive source-code preview

**Homework card**:
The Teacher Side workspace for one homework file. It preserves the full learner-page layout for both evolving `Current work` and the confirmed submission, enables inline response-review controls only after submission, and provides one separate link to the matched teacher version when that version exists.
_Avoid_: Detached submission queue, combined teacher-and-learner layout

**External book homework**:
Homework sourced from an embedded or linked whole PDF/book. It has no generated teacher version or automatic marking. When it has a portal HTML response form, the learner's normal submission confirms receipt; when it has no portal response form, the teacher manually records `Work received`. In either case, the teacher enters review, corrections, and any optional percentage grade manually.
_Avoid_: Generated answer-key workflow, automatic PDF grading

**Portal HTML homework**:
Homework answered directly in the portal's canonical HTML layout with live autosave and deliberate submission. A PDF export may support printing or offline reference but is never uploaded or treated as the response source.
_Avoid_: PDF answer upload, reconstructed PDF submission

**Overall submission review**:
One feedback package for a submitted homework file. It may contain response-level manual marks and comments, teacher feedback supplied as text, PDF, or native HTML, and one optional equal-weight percentage grade auto-suggested only after every response is marked, using `Correct = 100%`, `Partly correct = 50%`, and `Incorrect = 0%`, rounded to the nearest whole percent. The grade is saved or released only after teacher confirmation or editing.
_Avoid_: Per-response grades, separate feedback workspace

**Response review**:
A teacher's `Correct`, `Partly correct`, `Incorrect`, or default `Not marked` status and optional comment attached to one submitted response. Fixed typed answers are compared case-insensitively after whitespace normalization against approved variants only, with no fuzzy spelling; automatic `Correct` or `Incorrect` remains teacher-overridable. Open-ended responses remain manually reviewed, private teacher changes autosave before confirmation, and no response creates points or a separate grade.
_Avoid_: Per-response grade, automatic correctness for open-ended work

**Teacher review release**:
A file-level decision that publishes a confirmed snapshot of response statuses and comments inline in the latest checked submission layout, together with the optional overall grade and feedback package. Reviews previously released for earlier attempts remain visible in learner history; later edits stay private until reconfirmed and republished, and no review becomes available before its matching submission and teacher checking.
_Avoid_: Draft feedback, response-by-response release

**Current work**:
Nelson's autosaved responses and answered/unanswered state for one homework file before final submission, automatically refreshed in the exact learner layout inside that homework's teacher card. Response marking and grading stay locked until confirmed submission.
_Avoid_: Live-drafts section, progress dashboard

**Work version**:
One state in a homework file's history: the latest autosaved draft or a confirmed submission attempt, pinned to the canonical HTML version active when that attempt began. Submission locks the work; teacher action `Reopen for revision` creates correction work prefilled from the prior submitted answers rather than a blind retake, while retaining each prior submission with its own response marks, comments, correction, and overall grade as read-only history. Teacher Side opens the latest attempt by default.
_Avoid_: Overwritten submission, unlabelled answer snapshot

**Student access mirror**:
A temporary alternate entry point for the same released learner portal. It neither replaces the canonical portal nor becomes a second publication or evidence authority.
_Avoid_: Replacement portal, second source of truth
