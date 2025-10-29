# Video Feedback App - Feature Tests

## Version 2.0.0

This document describes the new features and how to test them.

## 1. Commenter Identity System

### Feature Description
Each commenter has:
- `viewerId`: Unique, persistent, anonymous UUID v4
- `displayName`: User-entered name (editable)
- `color`: Deterministically generated from viewerId

### Test Steps
1. Open the app for the first time
2. **Expected**: Identity dialog should appear asking for display name
3. Enter a display name (e.g., "Test User")
4. Click "Save"
5. **Expected**: Display name should be saved to localStorage
6. Create a new annotation (pin or drawing)
7. **Expected**: Annotation should have viewerId, displayName, and commenterColor fields
8. Reload the page
9. **Expected**: Display name should persist from localStorage
10. Create another annotation
11. **Expected**: Same identity should be used

### Success Criteria
- ✓ Identity dialog appears on first use
- ✓ Display name persists across sessions
- ✓ All new annotations include identity fields
- ✓ Color is deterministically generated from viewerId

---

## 2. Identity Reassignment Dialog

### Feature Description
When loading a project with unassigned comments:
- Dialog appears with dropdown of existing identities
- Option to create "New commenter..."
- Assigns selected identity to all unassigned comments

### Test Steps
1. Create a legacy project file without identity fields:
```json
{
  "version": 3,
  "annotations": [
    {
      "id": "test1",
      "type": "pin",
      "x": 0.5,
      "y": 0.5,
      "time": 5,
      "text": "Test comment",
      "color": "#5b9cff",
      "createdAt": 1234567890
    }
  ]
}
```
2. Load this project file
3. **Expected**: Reassignment dialog should appear
4. **Expected**: Dropdown should show existing identities + "New commenter..."
5. Select an identity or create new one
6. Click "Assign"
7. **Expected**: All unassigned annotations now have identity fields

### Success Criteria
- ✓ Dialog appears when loading projects with unassigned comments
- ✓ Dropdown populated with existing identities
- ✓ Can assign to existing identity
- ✓ Can create new identity
- ✓ All unassigned comments get assigned

---

## 3. Unsaved Changes Guard

### Feature Description
- Tracks modified/unsaved annotations
- Shows confirmation when closing/navigating away
- Prevents accidental data loss

### Test Steps
1. Load a video and create an annotation
2. **Expected**: `state.isDirty` should be true
3. Try to close the browser tab
4. **Expected**: Browser should show "You have unsaved changes" warning
5. Save the project
6. **Expected**: `state.isDirty` should be false
7. Try to close the tab again
8. **Expected**: No warning should appear

### Success Criteria
- ✓ Dirty flag set when creating annotations
- ✓ Dirty flag set when editing annotations
- ✓ beforeunload event triggers with warning
- ✓ Saving project clears dirty flag
- ✓ No warning after saving

---

## 4. Full-Screen Export Overlay

### Feature Description
- Near full-screen modal (95vw x 95vh)
- Filename input with auto-filled name
- Export format selection (PDF/JSON)
- Live metadata summary
- Current user display
- Current date/time
- Prominent export button

### Test Steps
1. Load a video and create annotations
2. Click "Export" button
3. **Expected**: Full-screen overlay appears
4. **Expected**: Metadata summary shows:
   - Video filename
   - Duration
   - Resolution
   - File size
   - Exported by (display name)
   - Viewer ID (first 8 chars)
   - Export date/time
   - App version
   - Total annotations
5. **Expected**: Filename is auto-filled with video name + date
6. **Expected**: Format dropdown shows PDF and JSON options
7. **Expected**: Export button is prominently displayed

### Success Criteria
- ✓ Overlay is nearly full-screen
- ✓ All metadata fields populated correctly
- ✓ Filename auto-generated
- ✓ Format selection available
- ✓ UI is clean and professional
- ✓ Responsive on different screen sizes

---

## 5. Export Metadata Enhancement

### Feature Description
Export files include comprehensive header:
- videoFilename, fullPath, duration, resolution, fps, fileSize
- createdAt, exportTimestamp
- app version
- current displayName
- Comments/annotations with full identity info

### Test Steps
1. Create a project with annotations
2. Export to PDF
3. **Expected**: PDF includes cover page with:
   - "Video Feedback Export" title
   - Video Information section
   - Export Information section
   - Project Notes section
4. Check exported PDF content
5. **Expected**: Metadata includes all required fields
6. Export to JSON (if implemented)
7. **Expected**: JSON includes identityMap and metadata

### Success Criteria
- ✓ PDF cover page includes comprehensive metadata
- ✓ Video information complete
- ✓ Export information includes user, date, version
- ✓ All required fields present
- ✓ Formatting is professional and readable

---

## 6. Version Tracking

### Feature Description
- `APP_VERSION` constant at top of app.js
- Version displayed in exports and project files
- Easy to update for releases

### Test Steps
1. Check `app.js` line 3
2. **Expected**: `const APP_VERSION = '2.0.0';`
3. Export a PDF
4. **Expected**: PDF metadata shows "App Version: 2.0.0"
5. Save a project
6. **Expected**: Project JSON includes `"appVersion": "2.0.0"`

### Success Criteria
- ✓ APP_VERSION constant defined
- ✓ Version appears in PDF exports
- ✓ Version saved in project files
- ✓ Easy to increment for future releases

---

## 7. Bug Fix: "opts is not defined"

### Feature Description
Fixed `exportPdf()` function signature to accept parameters

### Test Steps
1. Create annotations
2. Open export dialog
3. Select some annotations
4. Click "Export" / "Save PDF"
5. **Expected**: PDF exports successfully without errors
6. Check browser console
7. **Expected**: No "opts is not defined" errors

### Success Criteria
- ✓ No console errors during export
- ✓ Function signature includes `items` and `opts` parameters
- ✓ Export completes successfully

---

## Integration Testing

### Full Workflow Test
1. Open app for first time
2. Enter display name
3. Load a video file
4. Create several annotations (pins and drawings)
5. Add tags and comments
6. Load a legacy project with unassigned comments
7. Reassign comments
8. Try to close without saving
9. Confirm unsaved changes warning appears
10. Save project
11. Export to PDF
12. Verify all metadata is correct
13. Reload the page
14. Load the saved project
15. Verify all data persists correctly

### Expected Results
- All features work seamlessly together
- No data loss
- Identity management works correctly
- Exports contain complete metadata
- UX is smooth and professional

---

## Accessibility Checklist

- ✓ All interactive elements keyboard accessible
- ✓ Color contrast meets WCAG AA standards
- ✓ Form labels properly associated
- ✓ Modal dialogs properly announced
- ✓ Focus management in dialogs
- ✓ Error messages clear and helpful

---

## Browser Compatibility

Tested on:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari

---

## Known Issues

1. Export location logic not yet implemented (defaults to downloads folder)
2. JSON export format not fully implemented
3. File path may be redacted in exports for privacy

---

## Future Enhancements

1. Export location picker with memory
2. More export formats (CSV, Markdown)
3. Batch export operations
4. Import from other formats
5. Collaborative features with multiple users
