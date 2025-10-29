# vid_feedback

Simple browser-based tool to annotate videos with time-stamped on-screen comments, save/load annotations, and export a PDF report with snapshot frames.

Quick start
- Open `index.html` in your browser (no server required).
- Click `Load Video` (or drag & drop a file into the player area).
- Use the toolbar:
  - `Select`: interact with video controls (play/pause, scrub).
  - `Pin`: click the video to drop a pin and write a comment at the current time.
  - `Draw`: freehand draw on the video at the current time. Choose color and width.
- Adjust the visibility window via `± seconds` to control when annotations show relative to their timestamp.
- Click `Save` to download a JSON file; use `Load Annotations` to restore.
- Click `Export PDF` to generate a PDF with snapshot frames and the comments for each annotated time.

Notes
- Works entirely client-side. Local videos use an object URL so frame snapshots can be captured.
- PDF generation uses jsPDF via CDN. If offline, place a local jsPDF build and update the `<script>` tag in `index.html`.
- Annotations store normalized coordinates, so they scale with the player size. Pin annotations have `{type:'pin', x,y,time,text}`, drawings have `{type:'path', points,color,width,time}`.

LosslessCut-inspired UX additions
- Bottom transport bar with prominent play/pause and step controls, centered for easy access.
- Persistent time display `current / total` and a timeline strip that shows the playhead and annotation markers.
- Jump to previous/next annotation buttons and keyboard shortcuts: `A` and `D`.
- Space toggles play/pause, arrows step by a frame-length (approx 1/30s), Shift+arrows step by 1s.
- Mode shortcuts: `S` Select, `M` Pin, `B` Draw. `Ctrl+S` saves JSON.

Timeline zoom, pan, in/out and snapping
- Zoom slider (1–40x) focuses the timeline around the playhead; Alt+drag pans the view.
- In/Out markers: `Set In` (I) and `Set Out` (O) to define a range. `Clear` (X) removes them. Range is highlighted on the timeline.
- Snapping toggle: when scrubbing on the timeline, the playhead snaps to nearby annotation markers (within ~10px).

Projects and notes
- Use `Save Project` to export a single `.vfa.json` that includes notes, margin, annotations, and video metadata (name, size, modified, duration). Use `Load Project` to restore.
- Due to browser security, the video file itself isn’t embedded; after loading a project, if the video isn’t already loaded, you’ll be prompted to load the referenced file (the filename is shown).
- A “Project Notes” section sits above the annotation list. Notes are saved with the project and included as a cover page in the PDF.
