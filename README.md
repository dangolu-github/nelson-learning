# Nelson English Learning

Static student portal and public-safe teacher operations page for Nelson's
IELTS-standard B1-B2 English course.

- Student routes contain released student materials only.
- HTML learning materials open as native, responsive portal pages rather than
  embedded PDFs.
- Skill Boosters currently contain only the explicitly approved Grammar book.
- Interactive homework saves on the learner's device and synchronizes progress
  and final submissions to a private Google workbook.
- `/teacher/` mirrors public release state and provides links into
  Google-authenticated private administration and matched teacher materials.
- Teacher notes, answer keys, trackers, and administration records stay outside this repository.
- Private Google files remain owner-only; their links do not grant access.
- The access screen is a low-friction device gate. GitHub Pages is static, so it is not strong file-level authentication.
- Course evidence states remain controlled by the Nelson course index and checked learner work.

## Mainland mirror

GitHub `main` is the canonical source for the Tencent CloudBase learner mirror.
CloudBase runs `npm run build:cloudbase` and publishes `cloudbase-dist/`.
That build uses an explicit learner-only allowlist: the portal root files,
public assets, approved boosters, and every top-level released date directory.
It never publishes `/teacher/`, repository operations, planning files, or
private records.
