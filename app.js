(() => {
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const ctx = overlay.getContext('2d');
  const fileInput = document.getElementById('videoFile');
  // Tools and settings
  const toolSelect = document.getElementById('toolSelect');
  const toolPin = document.getElementById('toolPin');
  const toolDraw = document.getElementById('toolDraw');
  const colorInput = document.getElementById('colorInput');
  const widthInput = document.getElementById('widthInput');
  const widthVal = document.getElementById('widthVal');
  const marginInput = document.getElementById('marginInput');
  const annotationListEl = document.getElementById('annotationList');
  const loadJsonInput = document.getElementById('loadJson');
  const saveJsonBtn = document.getElementById('saveJson');
  const saveProjectBtn = document.getElementById('saveProject');
  const loadProjectInput = document.getElementById('loadProject');
  const exportPdfBtn = document.getElementById('exportPdf');
  const clearAllBtn = document.getElementById('clearAll');
  const projectNotesEl = document.getElementById('projectNotes');
  const helpBtn = document.getElementById('helpBtn');
  const helpDialog = document.getElementById('helpDialog');
  const helpShowOnStart = document.getElementById('helpShowOnStart');
  const themeToggle = document.getElementById('themeToggle');
  // Filters
  const filterTypeSel = document.getElementById('filterType');
  const filterTagInput = document.getElementById('filterTag');
  const sortOrderSel = document.getElementById('sortOrder');
  const tagsDatalist = document.getElementById('tagsDatalist');
  const splitter = document.getElementById('splitter');
  // Transport + timeline
  const playPauseBtn = document.getElementById('playPause');
  const stepBackBtn = document.getElementById('stepBack');
  const stepFwdBtn = document.getElementById('stepFwd');
  const prevAnnBtn = document.getElementById('prevAnn');
  const nextAnnBtn = document.getElementById('nextAnn');
  const timecodeEl = document.getElementById('timecode');
  const durationEl = document.getElementById('duration');
  const timelineCanvas = document.getElementById('timeline');
  const timelineContainer = timelineCanvas?.parentElement;
  const tl = timelineCanvas?.getContext('2d');
  const zoomInput = document.getElementById('zoomInput');
  const setInBtn = document.getElementById('setIn');
  const setOutBtn = document.getElementById('setOut');
  const clearRangeBtn = document.getElementById('clearRange');
  const snapToggle = document.getElementById('snapToggle');
  // HUD controls
  const centerStatus = document.getElementById('centerStatus');
  const miniControls = document.getElementById('miniControls');
  const miniBack = document.getElementById('miniBack');
  const miniToggle = document.getElementById('miniToggle');
  const miniFwd = document.getElementById('miniFwd');
  // Export dialog
  const exportDialog = document.getElementById('exportDialog');
  const exportListEl = document.getElementById('exportList');
  const exportPreviewEl = document.getElementById('exportPreview');
  const expBuildPreviewBtn = document.getElementById('expBuildPreview');
  const expSavePdfBtn = document.getElementById('expSavePdf');
  const expSelectAllChk = document.getElementById('expSelectAll');
  const expIncludeNotesChk = document.getElementById('expIncludeNotes');
  const expUseRangeChk = document.getElementById('expUseRange');
  const expStatusEl = document.getElementById('expStatus');

  let state = {
    annotations: [],
    mode: 'select', // 'select' | 'pin' | 'draw'
    pendingPoint: null, // {x,y,time}
    drawing: null,
    scrubbing: false,
    frameStep: 1/30,
    zoom: 1, // 1 = fit all, higher = zoom in
    offset: 0, // visible start time
    markIn: null,
    markOut: null,
    notes: '',
    videoMeta: null,
    filters: { type: 'all', tag: '', sort: 'time-asc' },
    tempDrawKey: false,
    pendingEdit: null,
    seek: { timer:null, holdTimer:null, dir:0, start:0 },
    selectedIds: new Set(),
    waveformData: { left: null, right: null }, // Audio waveform data for visualization
  };

  const hidePlaceholder = ()=>{ const ph=document.getElementById('placeholder'); if (ph) ph.style.display='none'; };
  const showPlaceholder = ()=>{ const ph=document.getElementById('placeholder'); if (ph) ph.style.display='flex'; };

  // Waveform canvas references
  const waveformLeftCanvas = document.getElementById('waveformLeft');
  const waveformRightCanvas = document.getElementById('waveformRight');
  const waveformLeftCtx = waveformLeftCanvas?.getContext('2d');
  const waveformRightCtx = waveformRightCanvas?.getContext('2d');

  function visibleRange(){
    const dur = video.duration || 0;
    if (state.zoom <= 1 || !dur) return { start: 0, end: dur || 0 };
    const span = dur / state.zoom;
    const start = Math.max(0, Math.min(dur - span, state.offset));
    return { start, end: start + span };
  }

  function secondsPerPixel(){
    if (!timelineCanvas) return 0.01;
    const { start, end } = visibleRange();
    const width = timelineCanvas.width || 1;
    return (end - start) / width;
  }

  // jsPDF loader with fallback
  async function ensureJsPdf(){
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    // attempt to load alternative CDN
    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];
    for (const url of urls){
      try{
        await new Promise((res, rej)=>{
          const s = document.createElement('script');
          s.src = url; s.async = true; s.crossOrigin='anonymous';
          s.onload = ()=> res(); s.onerror = (e)=> rej(e);
          document.head.appendChild(s);
        });
        if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
      }catch{ /* try next */ }
    }
    throw new Error('jsPDF failed to load from CDNs');
  }

  function fmtTime(t){
    if (!Number.isFinite(t)) return '0:00.000';
    const m = Math.floor(t/60);
    const s = t % 60;
    return `${m}:${s.toFixed(3).padStart(6,'0')}`;
  }

  function resizeOverlay(){
    const rect = video.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    overlay.width = w; overlay.height = h;
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
    drawOverlay();
    drawTimeline();
  }

  function videoDim(){
    const rect = overlay.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function clearCanvas(){ ctx.clearRect(0,0,overlay.width, overlay.height); }
  function clearTimeline(){ if (timelineCanvas) tl.clearRect(0,0,timelineCanvas.width,timelineCanvas.height); }

  function roundRectPath(c, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    c.beginPath();
    c.moveTo(x+rr,y);
    c.arcTo(x+w,y,x+w,y+h,rr);
    c.arcTo(x+w,y+h,x,y+h,rr);
    c.arcTo(x,y+h,x,y,rr);
    c.arcTo(x,y,x+w,y,rr);
    c.closePath();
  }

  // Snapshot helper used for preview and export
  async function snapshotAt(time, pinsOrPaths=[], canvasW, canvasH){
    const vW = video.videoWidth || 1280;
    const vH = video.videoHeight || 720;
    const maxW = canvasW || 640; const maxH = canvasH || 360;
    const k = Math.min(maxW/vW, maxH/vH);
    const w = Math.round(vW*k), h = Math.round(vH*k);
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const offCtx = off.getContext('2d');
    return new Promise((resolve, reject)=>{
      const onError = (e)=>{ cleanup(); reject(e); };
      const onSeeked = () => {
        try {
          offCtx.clearRect(0,0,w,h);
          offCtx.drawImage(video, 0, 0, w, h);
          for (const p of pinsOrPaths){
            if (p.type === 'path'){
              offCtx.save();
              offCtx.strokeStyle = p.color || '#5b9cff';
              offCtx.lineWidth = p.width || 3;
              offCtx.lineJoin = 'round'; offCtx.lineCap = 'round';
              const pts = p.points || [];
              if (pts.length){
                offCtx.beginPath();
                offCtx.moveTo(pts[0].x*w, pts[0].y*h);
                for (let i=1;i<pts.length;i++) offCtx.lineTo(pts[i].x*w, pts[i].y*h);
                offCtx.stroke();
              }
              offCtx.restore();
            } else {
              const px = p.x * w, py = p.y * h;
              offCtx.beginPath(); offCtx.arc(px, py, 8, 0, Math.PI*2);
              offCtx.fillStyle = (p.color || '#5b9cff') + 'cc'; offCtx.fill();
              offCtx.lineWidth = 2; offCtx.strokeStyle = '#ffffffee'; offCtx.stroke();
              if (p.text){
                offCtx.font = '600 14px system-ui, Segoe UI, Arial';
                const pad = 6; const textW = offCtx.measureText(p.text).width;
                const x = Math.min(px + 12, w - textW - pad*2 - 6); const y = Math.max(py - 12, 18);
                const rx = 6; const bw = textW + pad*2; const bh = 22;
                offCtx.beginPath();
                offCtx.moveTo(x+rx, y-14);
                offCtx.arcTo(x+bw, y-14, x+bw, y-14+bh, rx);
                offCtx.arcTo(x+bw, y-14+bh, x, y-14+bh, rx);
                offCtx.arcTo(x, y-14+bh, x, y-14, rx);
                offCtx.arcTo(x, y-14, x+bw, y-14, rx);
                offCtx.closePath();
                offCtx.fillStyle = '#10131acc'; offCtx.fill();
                offCtx.strokeStyle = '#293041'; offCtx.stroke();
                offCtx.fillStyle = '#e6e8ef'; offCtx.fillText(p.text, x + pad, y + 3);
              }
            }
          }
          resolve({ dataUrl: off.toDataURL('image/jpeg', 0.9), w, h });
        } catch (err) { reject(err); }
        finally { cleanup(); }
      };
      const cleanup = ()=>{ video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError); };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      try { video.currentTime = Math.min(Math.max(time, 0), (video.duration||time)); }
      catch (e){ cleanup(); reject(e); }
    });
  }

  function wrapLines(ctx, text, maxWidth){
    const words = String(text||'').split(/\s+/);
    const lines = []; let line = '';
    for (const w of words){
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth){ line = test; }
      else { if (line) lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines.length? lines:[''];
  }

  function drawPin(px, py, label, color){
    const r = 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI*2);
    ctx.fillStyle = (color ? color + 'cc' : '#5b9cffcc');
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffffee';
    ctx.stroke();
    if (label){
      ctx.font = '600 13px system-ui, Segoe UI, Arial';
      ctx.fillStyle = '#e6e8ef';
      const pad = 6; const lineH = 16;
      const maxW = Math.min(overlay.width * 0.7, 600);
      const lines = wrapLines(ctx, label, maxW);
      const widest = Math.max(...lines.map(l=>ctx.measureText(l).width), 0);
      const boxW = widest + pad*2; const boxH = lines.length * lineH + pad*2 - 2;
      const x = Math.min(px + 12, overlay.width - boxW - 6);
      const y = Math.max(py - 12, 18 + boxH/2);
      roundRectPath(ctx, x, y-14, boxW, boxH, 6);
      ctx.fillStyle = '#10131acc';
      ctx.fill();
      ctx.strokeStyle = '#293041';
      ctx.stroke();
      ctx.fillStyle = '#e6e8ef';
      for (let i=0;i<lines.length;i++){
        ctx.fillText(lines[i], x + pad, y - 6 + (i+1)*lineH);
      }
    }
    ctx.restore();
  }

  function drawPath(points, color, width, scaleW, scaleH){
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color || '#5b9cff';
    ctx.lineWidth = width || 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const p0 = points[0];
    ctx.moveTo(p0.x * scaleW, p0.y * scaleH);
    for (let i=1;i<points.length;i++){
      const p = points[i];
      ctx.lineTo(p.x * scaleW, p.y * scaleH);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlay(){
    clearCanvas();
    const margin = parseFloat(marginInput.value) || 0;
    const t = video.currentTime || 0;
    const { w, h } = videoDim();
    for (const a of state.annotations){
      if (Math.abs(a.time - t) <= margin){
        if (a.type === 'path'){
          drawPath(a.points, a.color, a.width, w, h);
        } else {
          const px = (a.x||0) * w;
          const py = (a.y||0) * h;
          drawPin(px, py, a.text, a.color);
        }
      }
    }
    if (state.mode==='draw' && state.drawing && state.drawing.points){
      drawPath(state.drawing.points, state.drawing.color, state.drawing.width, w, h);
    }
  }

  function drawTimeline(){
    if (!timelineCanvas || !tl) return;
    const rect = timelineContainer.getBoundingClientRect();
    const width = Math.max(200, Math.floor(rect.width));
    const height = Math.floor(rect.height);
    if (timelineCanvas.width !== width || timelineCanvas.height !== height){
      timelineCanvas.width = width; timelineCanvas.height = height;
    }
    clearTimeline();
    const dur = video.duration || 0;
    const t = video.currentTime || 0;
    const { start, end } = visibleRange();
    const span = Math.max(0.001, end - start);
    const toX = (time)=> (width * (time - start) / span);
    // progress
    tl.fillStyle = 'rgba(255,255,255,0.06)';
    tl.fillRect(0, 0, Math.max(0, Math.min(width, toX(t))), height);
    // ticks
    const tickColor = 'rgba(255,255,255,0.25)';
    const midColor = 'rgba(255,255,255,0.35)';
    const bottom = height-1;
    const approxTicks = Math.max(4, Math.floor(width/100));
    const step = span/approxTicks || 1;
    tl.strokeStyle = tickColor;
    tl.beginPath();
    for (let i=0;i<=approxTicks;i++){
      const tt = start + i*step;
      const x = toX(tt);
      const h = (i%5===0)?12:6;
      tl.moveTo(x, bottom);
      tl.lineTo(x, bottom-h);
    }
    tl.stroke();
    // mid-line
    tl.strokeStyle = 'rgba(0,0,0,0.25)';
    tl.beginPath(); tl.moveTo(0,bottom+0.5); tl.lineTo(width,bottom+0.5); tl.stroke();
    // annotation markers
    const margin = parseFloat(marginInput.value)||0;
    for (const a of state.annotations){
      if (a.time < start || a.time > end) continue;
      const x = toX(a.time);
      const isNear = Math.abs(a.time - t) <= margin;
      const base = a.color || (a.type==='path' ? '#e6b35a' : '#5b9cff');
      tl.fillStyle = base;
      tl.beginPath();
      tl.arc(x, height-14, 4, 0, Math.PI*2);
      tl.fill();
      if (isNear){
        tl.strokeStyle = '#ffffffaa'; tl.lineWidth = 1.5;
        tl.beginPath(); tl.arc(x, height-14, 6, 0, Math.PI*2); tl.stroke();
      }
    }
    // in/out region
    if (state.markIn!=null || state.markOut!=null){
      const a = state.markIn!=null ? Math.max(start, state.markIn) : start;
      const b = state.markOut!=null ? Math.min(end, state.markOut) : end;
      if (b > a){
        tl.fillStyle = 'rgba(91,156,255,0.16)';
        tl.fillRect(toX(a), 0, toX(b)-toX(a), height);
        // edge lines
        tl.strokeStyle = 'rgba(91,156,255,0.7)'; tl.lineWidth = 2;
        tl.beginPath(); tl.moveTo(toX(a),0); tl.lineTo(toX(a),height); tl.stroke();
        tl.beginPath(); tl.moveTo(toX(b),0); tl.lineTo(toX(b),height); tl.stroke();
      }
    }
    // playhead - modern design with circular handle
    const px = toX(t);
    if (px >= 0 && px <= width) {
      // Vertical line
      tl.strokeStyle = '#06c167'; // primary green for visibility
      tl.lineWidth = 3;
      tl.beginPath();
      tl.moveTo(px, 10);
      tl.lineTo(px, height);
      tl.stroke();

      // Circular handle at top
      tl.fillStyle = '#06c167';
      tl.shadowColor = 'rgba(6, 193, 103, 0.4)';
      tl.shadowBlur = 8;
      tl.beginPath();
      tl.arc(px, 8, 6, 0, Math.PI * 2);
      tl.fill();
      tl.shadowBlur = 0; // reset shadow

      // White center dot for contrast
      tl.fillStyle = '#ffffff';
      tl.beginPath();
      tl.arc(px, 8, 2.5, 0, Math.PI * 2);
      tl.fill();
    }
  }

  // Extract audio waveform data from video
  async function extractWaveformData() {
    if (!video.src || !video.duration) return;

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const response = await fetch(video.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Extract left and right channels
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

      // Downsample for visualization (1000 samples per second of audio)
      const samplesPerPixel = Math.max(1, Math.floor(audioBuffer.sampleRate / 1000));
      const leftData = downsampleAudio(leftChannel, samplesPerPixel);
      const rightData = downsampleAudio(rightChannel, samplesPerPixel);

      state.waveformData = { left: leftData, right: rightData };
      drawWaveforms();
    } catch (err) {
      console.error('Failed to extract waveform:', err);
    }
  }

  function downsampleAudio(channelData, samplesPerPixel) {
    const downsampled = [];
    for (let i = 0; i < channelData.length; i += samplesPerPixel) {
      let min = 1, max = -1;
      for (let j = 0; j < samplesPerPixel && i + j < channelData.length; j++) {
        const sample = channelData[i + j];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      downsampled.push({ min, max });
    }
    return downsampled;
  }

  function drawWaveform(canvas, ctx, data, color) {
    if (!canvas || !ctx || !data) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(200, Math.floor(rect.width - 20)); // Account for label
    const height = Math.floor(rect.height - 8); // Account for padding

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    const { start, end } = visibleRange();
    const dur = video.duration || 0;
    if (!dur) return;

    // Calculate which samples to show based on visible range
    const samplesPerSecond = data.length / dur;
    const startSample = Math.floor(start * samplesPerSecond);
    const endSample = Math.ceil(end * samplesPerSecond);
    const visibleData = data.slice(startSample, endSample);

    if (visibleData.length === 0) return;

    const midY = height / 2;
    const barWidth = Math.max(1, width / visibleData.length);

    // Draw waveform
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    for (let i = 0; i < visibleData.length; i++) {
      const x = (i / visibleData.length) * width;
      const sample = visibleData[i];

      const minY = midY - (sample.min * midY);
      const maxY = midY - (sample.max * midY);
      const barHeight = Math.max(1, maxY - minY);

      ctx.fillRect(x, minY, Math.max(barWidth, 1), barHeight);
    }

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Draw playhead position
    const t = video.currentTime || 0;
    if (t >= start && t <= end) {
      const span = Math.max(0.001, end - start);
      const px = ((t - start) / span) * width;
      ctx.strokeStyle = '#06c167';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
  }

  function drawWaveforms() {
    if (!state.waveformData.left || !state.waveformData.right) return;

    drawWaveform(waveformLeftCanvas, waveformLeftCtx, state.waveformData.left, '#4a9eff');
    drawWaveform(waveformRightCanvas, waveformRightCtx, state.waveformData.right, '#ff6b6b');
  }

  function setMode(mode){
    state.mode = mode;
    if (toolSelect) toolSelect.classList.toggle('active', mode==='select');
    if (toolPin) toolPin.classList.toggle('active', mode==='pin');
    if (toolDraw) toolDraw.classList.toggle('active', mode==='draw');
    overlay.style.pointerEvents = (mode==='pin' || mode==='draw') ? 'auto' : 'none';
    overlay.style.cursor = mode==='pin' ? 'crosshair' : (mode==='draw' ? 'crosshair' : 'default');
  }

  function renderList(){
    annotationListEl.innerHTML = '';
    let items = [...state.annotations];
    // apply filters
    const ft = state.filters?.type || 'all';
    const tag = (state.filters?.tag || '').trim().toLowerCase();
    if (ft !== 'all') items = items.filter(a=>a.type===ft);
    if (tag) items = items.filter(a=> (a.tag||'').toLowerCase() === tag);
    // sort
    const so = state.filters?.sort || 'time-asc';
    if (so==='time-asc') items.sort((a,b)=>a.time-b.time);
    else if (so==='time-desc') items.sort((a,b)=>b.time-a.time);
    else if (so==='updated-desc') items.sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
    // refresh tag list
    if (tagsDatalist){
      const tags = [...new Set(state.annotations.map(a=>a.tag).filter(Boolean))].sort();
      tagsDatalist.innerHTML = tags.map(t=>`<option value="${t}"></option>`).join('');
    }
    // hide drawings that belong to a pin so they appear merged with the pin
    items = items.filter(a=> !(a.type==='path' && a.parentId));
    for (const a of items){
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = a.id;
      // Shift+click to select for merge
      card.addEventListener('click', (e)=>{
        if (!e.shiftKey) return;
        e.preventDefault();
        if (state.selectedIds.has(a.id)) state.selectedIds.delete(a.id); else state.selectedIds.add(a.id);
        updateSelectionStyles();
      });
      // Right-click to merge selected
      card.addEventListener('contextmenu', (e)=>{
        e.preventDefault();
        if (state.selectedIds.size >= 2) mergeSelected();
      });
      const header = document.createElement('div');
      header.className = 'row';
      const meta = a.type==='path'
        ? `t=${fmtTime(a.time)} | drawing (${(a.points?.length||0)} pts, ${(a.width||3)}px)`
        : `t=${fmtTime(a.time)} | (x=${(((a.x||0)*100).toFixed(1))}%, y=${(((a.y||0)*100).toFixed(1))}%)`;
      header.innerHTML = `<div class="meta">${meta}</div>`;
      const metaRow = document.createElement('div');
      metaRow.className = 'row';
      const tagInput = document.createElement('input');
      tagInput.placeholder = 'tag';
      tagInput.setAttribute('list','tagsDatalist');
      tagInput.value = a.tag || '';
      tagInput.style.maxWidth = '120px';
      tagInput.addEventListener('input', ()=>{ a.tag = tagInput.value.trim(); a.updatedAt = Date.now(); drawTimeline(); });
      const colorInputInline = document.createElement('input');
      colorInputInline.type = 'color';
      colorInputInline.value = a.color || (a.type==='path' ? (a.color||'#e6b35a') : '#5b9cff');
      colorInputInline.addEventListener('input', ()=>{ a.color = colorInputInline.value; a.updatedAt = Date.now(); drawOverlay(); drawTimeline(); });
      metaRow.appendChild(tagInput);
      metaRow.appendChild(colorInputInline);

      const text = document.createElement('textarea');
      text.rows = 2;
      text.placeholder = a.type==='path' ? 'Optional note for drawing' : 'Write comment...';
      text.value = a.text || '';
      const chipsRow = document.createElement('div'); chipsRow.className='chips';
      const updateChips = ()=>{
        const chips = (text.value||'').match(/\b\d{1,2}:\d{2}(?:\.\d{1,3})?\b/g) || [];
        chipsRow.innerHTML = '';
        for (const tok of chips){
          const m = tok.match(/(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?/);
          if (!m) continue; const mm = parseInt(m[1],10), ss = parseInt(m[2],10), ms = m[3]? parseInt(m[3].padEnd(3,'0'),10):0;
          const sec = mm*60 + ss + ms/1000;
          const chip = document.createElement('span'); chip.className='chip'; chip.textContent = tok;
          chip.addEventListener('click', ()=>{ video.currentTime = sec; video.pause(); drawTimeline(); });
          chipsRow.appendChild(chip);
        }
      };
      updateChips();
      text.addEventListener('input', ()=>{ a.text = text.value; a.updatedAt = Date.now(); updateChips(); });
      text.addEventListener('blur', ()=>{ a.text = text.value.trim(); a.updatedAt = Date.now(); if (state.pendingEdit && state.pendingEdit.id===a.id){ const was=state.pendingEdit.wasPlaying; state.pendingEdit=null; if (was) video.play().catch(()=>{}); } });
      text.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); text.blur(); } });
      const actions = document.createElement('div');
      actions.className = 'actions';
      const jump = document.createElement('button');
      jump.textContent = 'Jump';
      jump.addEventListener('click', ()=>{ video.currentTime = a.time; video.pause(); drawOverlay(); });
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.addEventListener('click', ()=>{
        state.annotations = state.annotations.filter(x=>x.id!==a.id);
        renderList(); drawOverlay();
      });
      actions.append(jump, del);
      card.append(header, metaRow, text, chipsRow, actions);
      annotationListEl.appendChild(card);
    }
    markAndRevealClosest();
    updateSelectionStyles();
  }

  function updateSelectionStyles(){
    annotationListEl.querySelectorAll('.card').forEach(el=>{
      const id = el.dataset.id; el.classList.toggle('selected', state.selectedIds.has(id));
    });
  }

  function mergeSelected(){
    const ids = [...state.selectedIds];
    const selected = state.annotations.filter(a=> ids.includes(a.id));
    if (selected.length < 2) return;
    // Merge pins and drawings; compute time midpoint between min and max
    const times = selected.map(a=>a.time).sort((a,b)=>a-b);
    const tMid = (times[0] + times[times.length-1]) / 2;
    // Average pin coords
    const pins = selected.filter(a=>a.type==='pin');
    let x=0.5, y=0.5; if (pins.length){ x = pins.reduce((s,p)=>s+(p.x||0),0)/pins.length; y = pins.reduce((s,p)=>s+(p.y||0),0)/pins.length; }
    const color = (pins[0]?.color) || selected[0]?.color || '#5b9cff';
    const text = pins.map(p=>p.text).filter(Boolean).join('\n');
    const newPin = { id: guid(), type:'pin', x, y, time:tMid, text, color, createdAt: Date.now() };
    // Reassign drawings to new pin
    const drawings = state.annotations.filter(a=> a.type==='path' && ids.includes(a.parentId || a.id));
    drawings.forEach(d=>{ d.parentId = newPin.id; d.time = tMid; });
    // Remove old pins (keep drawings reassigned)
    const removeIds = new Set(pins.map(p=>p.id));
    state.annotations = state.annotations.filter(a=> !removeIds.has(a.id));
    state.annotations.push(newPin);
    state.selectedIds.clear();
    renderList(); drawTimeline(); video.currentTime = tMid; video.pause();
  }

  function guid(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}

  function normCoords(evt){
    const r = overlay.getBoundingClientRect();
    const x = (evt.clientX - r.left) / r.width;
    const y = (evt.clientY - r.top) / r.height;
    return { x: Math.max(0,Math.min(1,x)), y: Math.max(0,Math.min(1,y)) };
  }

  async function exportPdf(){
    if (!video.src){ alert('Load a video first'); return; }
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF){ alert('jsPDF failed to load'); return; }
    const items = [...state.annotations].sort((a,b)=>a.time-b.time);
    if (items.length===0){ alert('No annotations to export'); return; }

    const wasPaused = video.paused;
    video.pause();

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const maxW = 1100, maxH = 620;
    const scaleTo = (vw, vh) => {
      const rw = Math.min(maxW, pageW - 40);
      const rh = Math.min(maxH, pageH - 100);
      const k = Math.min(rw/vw, rh/vh);
      return { w: Math.round(vw*k), h: Math.round(vh*k) };
    };

    const vW = video.videoWidth || 1280;
    const vH = video.videoHeight || 720;
    const { w: canvasW, h: canvasH } = scaleTo(vW, vH);

    const off = document.createElement('canvas');
    off.width = canvasW; off.height = canvasH;
    const offCtx = off.getContext('2d');

    const snapshotAt = (time, pinsOrPaths=[]) => new Promise((resolve, reject)=>{
      const onError = (e)=>{ cleanup(); reject(e); };
      const onSeeked = () => {
        try {
          offCtx.clearRect(0,0,canvasW,canvasH);
          offCtx.drawImage(video, 0, 0, canvasW, canvasH);
          for (const p of pinsOrPaths){
            if (p.type === 'path'){
              offCtx.save();
              offCtx.strokeStyle = p.color || '#5b9cff';
              offCtx.lineWidth = p.width || 3;
              offCtx.lineJoin = 'round';
              offCtx.lineCap = 'round';
              const pts = p.points || [];
              if (pts.length){
                offCtx.beginPath();
                offCtx.moveTo(pts[0].x * canvasW, pts[0].y * canvasH);
                for (let i=1;i<pts.length;i++){
                  const q = pts[i];
                  offCtx.lineTo(q.x * canvasW, q.y * canvasH);
                }
                offCtx.stroke();
              }
              offCtx.restore();
            } else {
              const px = p.x * canvasW;
              const py = p.y * canvasH;
              offCtx.beginPath();
              offCtx.arc(px, py, 8, 0, Math.PI*2);
              offCtx.fillStyle = (p.color || '#5b9cff') + 'cc';
              offCtx.fill();
              offCtx.lineWidth = 2;
              offCtx.strokeStyle = '#ffffffee';
              offCtx.stroke();
              const label = p.text;
              if (label){
                offCtx.font = '600 14px system-ui, Segoe UI, Arial';
                const pad = 6; const lineH = 18; const maxW = Math.min(canvasW*0.7, 900);
                const wrap = (text)=>{ const words=String(text||'').split(/\s+/); const lines=[]; let ln=''; for(const w of words){ const t=ln?ln+' '+w:w; if (offCtx.measureText(t).width<=maxW){ ln=t; } else { if(ln) lines.push(ln); ln=w; } } if(ln) lines.push(ln); return lines.length?lines:['']; };
                const lines = wrap(label);
                const widest = Math.max(...lines.map(l=>offCtx.measureText(l).width),0);
                const bw = widest + pad*2; const bh = lines.length*lineH + pad*2 - 2;
                const x = Math.min(px + 12, canvasW - bw - 6);
                const y = Math.max(py - 12, 18 + bh/2);
                offCtx.beginPath();
                offCtx.moveTo(x+6, y-14); offCtx.arcTo(x+bw, y-14, x+bw, y-14+bh, 6);
                offCtx.arcTo(x+bw, y-14+bh, x, y-14+bh, 6);
                offCtx.arcTo(x, y-14+bh, x, y-14, 6);
                offCtx.arcTo(x, y-14, x+bw, y-14, 6); offCtx.closePath();
                offCtx.fillStyle='#10131acc'; offCtx.fill(); offCtx.strokeStyle='#293041'; offCtx.stroke(); offCtx.fillStyle='#e6e8ef';
                for(let i=0;i<lines.length;i++){ offCtx.fillText(lines[i], x+pad, y-6+(i+1)*lineH); }
              }
            }
          }
          resolve(off.toDataURL('image/jpeg', 0.9));
        } catch (err) { reject(err); }
        finally { cleanup(); }
      };
      const cleanup = ()=>{
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      try { video.currentTime = Math.min(Math.max(time, 0), (video.duration||time)); }
      catch (e){ cleanup(); reject(e); }
    });
    // Optional cover page with project notes
    if ((opts?.includeNotes ?? true) && state.notes && String(state.notes).trim()){
      pdf.setFontSize(18);
      pdf.text('Video Annotations', 20, 30);
      pdf.setFontSize(12);
      const meta = state.videoMeta || {};
      const parts = [];
      if (meta.name) parts.push('File: ' + meta.name);
      if (video.duration) parts.push('Duration: ' + fmtTime(video.duration));
      if (parts.length) pdf.text(parts.join('  |  '), 20, 50);
      pdf.setFontSize(14); pdf.text('Project Notes', 20, 80);
      pdf.setFontSize(12);
      const wrapped = pdf.splitTextToSize(String(state.notes), pageW - 40);
      pdf.text(wrapped, 20, 100);
      pdf.addPage('a4','landscape');
    }

    // filter by in/out if set
    const inSet = (state.markIn!=null);
    const outSet = (state.markOut!=null);
    let toExport = items;
    if (inSet || outSet){
      const a = state.markIn!=null ? state.markIn : 0;
      const b = state.markOut!=null ? state.markOut : (video.duration||Infinity);
      toExport = items.filter(x=> x.time >= a && x.time <= b);
    }
    for (let i=0;i<toExport.length;i++){
      const a = toExport[i];
      const margin = parseFloat(marginInput.value)||0;
      const nearby = state.annotations.filter(p=>Math.abs(p.time - a.time) <= margin);
      const uniqById = new Map([a, ...nearby].map(p=>[p.id,p]));
      const annos = [...uniqById.values()];
      // eslint-disable-next-line no-await-in-loop
      const dataUrl = await snapshotAt(a.time, annos);
      if (i>0) pdf.addPage('a4','landscape');
      pdf.setFontSize(14);
      pdf.text(`Time ${fmtTime(a.time)}`, 20, 26);
      const imgW = canvasW, imgH = canvasH;
      const x = (pageW - imgW)/2;
      const y = 40;
      pdf.addImage(dataUrl, 'JPEG', x, y, imgW, imgH);
      pdf.setFontSize(12);
      let yy = y + imgH + 24;
      const maxTextWidth = pageW - 40;
      for (const p of annos){
        const label = p.type==='path' ? (p.text ? `- [drawing] ${p.text}` : '- [drawing]') : `- ${p.text}`;
        if (!label) continue;
        const wrapped = pdf.splitTextToSize(label, maxTextWidth);
        pdf.text(wrapped, 20, yy);
        yy += (wrapped.length * 14) + 6;
      }
    }

    pdf.save('video-annotations.pdf');
    if (!wasPaused) video.play().catch(()=>{});
  }

  // Event wiring
  if (fileInput) {
    fileInput.addEventListener('change', (e)=>{
      const f = e.target.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      video.src = url;
      video.load();
      // do not autoplay on load
      state.videoMeta = { name:f.name, type:f.type, size:f.size, lastModified:f.lastModified };
      hidePlaceholder();
    });
  }

  video.addEventListener('loadedmetadata', ()=>{
    resizeOverlay();
    hidePlaceholder();
    durationEl.textContent = fmtTime(video.duration||0);
    // reset zoom to fit all
    state.zoom = 1; state.offset = 0; if (zoomInput) zoomInput.value = '1';
    // refresh meta with duration when possible
    const srcMeta = state.videoMeta || {};
    state.videoMeta = { ...srcMeta, duration: video.duration||0 };
    // Extract audio waveform data
    extractWaveformData();
  });
  window.addEventListener('resize', resizeOverlay);
  video.addEventListener('timeupdate', ()=>{ drawOverlay(); drawTimeline(); drawWaveforms(); timecodeEl.textContent = fmtTime(video.currentTime||0); markAndRevealClosest(); });
  video.addEventListener('seeked', ()=>{ drawOverlay(); drawTimeline(); drawWaveforms(); markAndRevealClosest(); });

  function scrollCardIntoViewById(id){
    const el = annotationListEl.querySelector(`.card[data-id="${id}"]`);
    if (!el) return;
    const c = annotationListEl;
    const top = el.offsetTop - c.offsetTop;
    const visibleTop = c.scrollTop;
    const visibleBottom = visibleTop + c.clientHeight;
    const elBottom = top + el.offsetHeight;
    // center it if outside view
    if (top < visibleTop || elBottom > visibleBottom){
      const target = top - (c.clientHeight - el.offsetHeight)/2;
      c.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }

  function markAndRevealClosest(){
    if (!state.annotations.length) return;
    const t = video.currentTime||0;
    let best = state.annotations[0]; let dist = Math.abs(best.time - t);
    for (const a of state.annotations){ const d = Math.abs(a.time - t); if (d < dist){ best=a; dist=d; } }
    // mark class
    annotationListEl.querySelectorAll('.card').forEach(el=> el.classList.toggle('closest', el.dataset.id===best.id));
    // avoid fighting with typing
    const active = document.activeElement; const typing = active && active.tagName==='TEXTAREA';
    if (!typing) scrollCardIntoViewById(best.id);
  }

  // Tool switching
  if (toolSelect) toolSelect.addEventListener('click', ()=> setMode('select'));
  if (toolPin) toolPin.addEventListener('click', ()=> setMode('pin'));
  if (toolDraw) toolDraw.addEventListener('click', ()=> setMode('draw'));
  if (widthInput) widthInput.addEventListener('input', ()=>{ widthVal.textContent = (widthInput.value||'3') + 'px'; if (state.drawing) state.drawing.width = parseInt(widthInput.value,10)||3; });

  // Pin placement (inline, no modal)
  overlay.addEventListener('click', (evt)=>{
    if (state.mode !== 'pin') return;
    const { x, y } = normCoords(evt);
    const a = { id: guid(), type:'pin', x, y, time: video.currentTime, text:'', createdAt: Date.now(), color: colorInput ? colorInput.value : '#5b9cff' };
    state.annotations.push(a);
    if (!video.paused){ state.pendingEdit = { id: a.id, wasPlaying: true }; video.pause(); }
    setMode('select');
    renderList();
    const lastCard = annotationListEl.lastElementChild; // focus newest
    if (lastCard){ const ta = lastCard.querySelector('textarea'); ta?.focus(); scrollCardIntoViewById(a.id); }
    drawOverlay();
  });

  // Quick Pin: Shift+click on the video while in Select mode
  video.addEventListener('click', (evt)=>{
    if (state.mode !== 'select') return;
    if (!evt.shiftKey) return;
    const r = video.getBoundingClientRect();
    const x = (evt.clientX - r.left) / r.width;
    const y = (evt.clientY - r.top) / r.height;
    const a = { id: guid(), type:'pin', x:Math.max(0,Math.min(1,x)), y:Math.max(0,Math.min(1,y)), time: video.currentTime, text:'', createdAt: Date.now(), color: colorInput ? colorInput.value : '#5b9cff' };
    state.annotations.push(a);
    const wasPlayingNow = !video.paused; if (wasPlayingNow) video.pause(); state.pendingEdit = { id: a.id, wasPlaying: wasPlayingNow };
    renderList(); drawOverlay();
    const lastCard = annotationListEl.lastElementChild; if (lastCard){ lastCard.querySelector('textarea')?.focus(); scrollCardIntoViewById(a.id); }
  });

  // Drawing
  let wasPlaying = false;
  overlay.addEventListener('mousedown', (evt)=>{
    if (state.mode !== 'draw') return;
    evt.preventDefault();
    const pt = normCoords(evt);
    wasPlaying = !video.paused;
    video.pause();
    state.drawing = {
      id: guid(),
      type: 'path',
      time: video.currentTime,
      color: colorInput ? colorInput.value : '#5b9cff',
      width: widthInput ? (parseInt(widthInput.value,10)||3) : 3,
      points: [pt],
      text: '',
      createdAt: Date.now(),
    };
    drawOverlay();
    const onMove = (e)=>{
      const p = normCoords(e);
      state.drawing.points.push(p);
      drawOverlay();
    };
    const onUp = ()=>{
      overlay.removeEventListener('mousemove', onMove);
      overlay.removeEventListener('mouseup', onUp);
      // Ensure there is a pin at this time; link drawing to it
      const eps = 0.05; // 50ms
      let pin = state.annotations.find(x=>x.type==='pin' && Math.abs(x.time - state.drawing.time) <= eps);
      if (!pin){
        const first = state.drawing.points?.[0] || {x:0.5,y:0.5};
        pin = { id: guid(), type:'pin', x:first.x, y:first.y, time: state.drawing.time, text:'', color: state.drawing.color || '#5b9cff', createdAt: Date.now() };
        state.annotations.push(pin);
      }
      state.drawing.parentId = pin.id;
      state.annotations.push(state.drawing);
      state.drawing = null;
      renderList();
      drawOverlay();
      if (wasPlaying) video.play().catch(()=>{});
    };
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseup', onUp, { once:true });
  });

  // Temporary Draw: hold D to draw then release to return to Select
  document.addEventListener('keydown', (e)=>{
    if (e.repeat) return;
    if ((e.key==='d' || e.key==='D') && state.mode==='select'){
      state.tempDrawKey = true; setMode('draw');
    }
  });
  document.addEventListener('keyup', (e)=>{
    if ((e.key==='d' || e.key==='D') && state.tempDrawKey){
      state.tempDrawKey = false; setMode('select');
    }
  });

  // Notes binding
  if (projectNotesEl){
    projectNotesEl.addEventListener('input', ()=>{ state.notes = projectNotesEl.value; });
    projectNotesEl.addEventListener('blur', ()=>{ state.notes = projectNotesEl.value.trim(); });
  }

  // Timeline interactions
  if (timelineCanvas){
    let panStart = null; // {x, offset}
    let dragMarker = null; // { id }
    const toTimeFromX = (clientX)=>{
      const r = timelineCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(r.width, clientX - r.left));
      const { start, end } = visibleRange();
      const span = Math.max(0.001, end-start);
      let t = start + (x / r.width) * span;
      if (snapToggle?.checked){
        const pxPerSec = r.width / span;
        const thresholdSec = 10 / pxPerSec; // 10px
        let best = null, bestD = Infinity;
        for (const a of state.annotations){
          const d = Math.abs(a.time - t);
          if (d < bestD){ bestD = d; best = a.time; }
        }
        if (best!=null && bestD <= thresholdSec) t = best;
      }
      return t;
    };
    const hitTestMarker = (clientX)=>{
      const r = timelineCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(r.width, clientX - r.left));
      const { start, end } = visibleRange();
      const span = Math.max(0.001, end-start);
      const toX = (time)=> r.width * (time - start) / span;
      const maxDist = 8; // px
      let best=null, bestD=Infinity;
      for (const a of state.annotations){
        if (a.type==='path' && a.parentId) continue; // pins only (or unlinked paths)
        if (a.time < start || a.time > end) continue;
        const d = Math.abs(toX(a.time) - x);
        if (d < bestD){ bestD=d; best=a; }
      }
      if (best && bestD <= maxDist) return best; else return null;
    };
    const onScrub = (e)=>{
      if (dragMarker){
        const t = toTimeFromX(e.clientX);
        const ann = state.annotations.find(a=>a.id===dragMarker.id);
        if (ann){
          ann.time = t;
          // move any drawings linked to this pin
          if (ann.type==='pin'){
            for (const d of state.annotations){ if (d.type==='path' && d.parentId===ann.id) d.time = t; }
          }
          video.currentTime = t; // live preview
          drawTimeline();
        }
      } else {
        video.currentTime = toTimeFromX(e.clientX);
        drawTimeline();
      }
    };
    timelineCanvas.addEventListener('mousedown', (e)=>{
      const hit = hitTestMarker(e.clientX);
      // Only allow dragging markers when holding Shift
      if (hit && e.shiftKey){
        video.pause();
        dragMarker = { id: hit.id };
        onScrub(e);
        return;
      }
      if (e.altKey || e.button===1){
        const r = timelineCanvas.getBoundingClientRect();
        panStart = { x: e.clientX, offset: visibleRange().start, width:r.width };
        state.scrubbing = false; return;
      }
      state.scrubbing = true; onScrub(e);
    });
    window.addEventListener('mousemove', (e)=>{
      if (dragMarker){ onScrub(e); }
      else if (state.scrubbing) onScrub(e);
      else if (panStart){
        const dur = video.duration || 0; if (!dur) return;
        const span = (visibleRange().end - visibleRange().start);
        const secPerPx = span / panStart.width;
        const dx = e.clientX - panStart.x;
        state.offset = Math.max(0, Math.min(dur - span, panStart.offset - dx*secPerPx));
        drawTimeline();
        drawWaveforms();
      }
    });
    window.addEventListener('mouseup', ()=>{ 
      if (dragMarker){ dragMarker = null; renderList(); }
      state.scrubbing = false; panStart = null; 
    });
  }

  // Zoom control
  if (zoomInput){
    zoomInput.addEventListener('input', ()=>{
      const old = state.zoom;
      state.zoom = Math.max(1, parseInt(zoomInput.value,10)||1);
      const dur = video.duration || 0; if (!dur){ drawTimeline(); drawWaveforms(); return; }
      const { start, end } = visibleRange();
      const spanOld = (old<=1? dur : dur/old);
      const spanNew = (state.zoom<=1? dur : dur/state.zoom);
      const center = video.currentTime || 0;
      state.offset = Math.max(0, Math.min(dur - spanNew, center - spanNew/2));
      drawTimeline();
      drawWaveforms();
    });
  }

  // In/Out controls
  if (setInBtn) setInBtn.addEventListener('click', ()=>{ state.markIn = video.currentTime||0; drawTimeline(); });
  if (setOutBtn) setOutBtn.addEventListener('click', ()=>{ state.markOut = video.currentTime||0; drawTimeline(); });
  if (clearRangeBtn) clearRangeBtn.addEventListener('click', ()=>{ state.markIn = null; state.markOut = null; drawTimeline(); });

  marginInput.addEventListener('change', ()=>{ drawOverlay(); });

  // Legacy saveJson functionality - optional button
  if (saveJsonBtn) {
    saveJsonBtn.addEventListener('click', ()=>{
      const data = {
        version: 3,
        margin: parseFloat(marginInput.value)||0,
        annotations: state.annotations,
        notes: state.notes || '',
      };
      const blob = new Blob([JSON.stringify(data,null,2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'annotations.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  // Filters UI
  function syncFilters(){
    if (filterTypeSel) state.filters.type = filterTypeSel.value;
    if (filterTagInput) state.filters.tag = filterTagInput.value;
    if (sortOrderSel) state.filters.sort = sortOrderSel.value;
    renderList(); drawTimeline();
  }
  filterTypeSel?.addEventListener('change', syncFilters);
  filterTagInput?.addEventListener('input', syncFilters);
  sortOrderSel?.addEventListener('change', syncFilters);

  // Help modal
  helpBtn?.addEventListener('click', ()=> helpDialog.showModal());
  helpDialog?.addEventListener('close', ()=>{
    if (helpShowOnStart) localStorage.setItem('vfa_help_show', helpShowOnStart.checked ? '1':'0');
  });
  if ((localStorage.getItem('vfa_help_show') ?? '1') === '1'){
    setTimeout(()=> helpDialog?.showModal(), 0);
  }

  // Theme toggle
  function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem('vfa_theme', t); }
  const savedTheme = localStorage.getItem('vfa_theme') || 'dark';
  applyTheme(savedTheme);
  themeToggle?.addEventListener('click', ()=>{ const cur = document.documentElement.getAttribute('data-theme')||'dark'; applyTheme(cur==='dark' ? 'light' : 'dark'); });

  // Legacy loadJson functionality - optional input
  if (loadJsonInput) {
    loadJsonInput.addEventListener('change', async (e)=>{
      const f = e.target.files?.[0];
      if (!f) return;
      try{
        const text = await f.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)){
          state.annotations = data;
        } else if (data && Array.isArray(data.annotations)){
          state.annotations = data.annotations;
          if (typeof data.margin === 'number') marginInput.value = String(data.margin);
          if (typeof data.notes === 'string'){ state.notes = data.notes; if (projectNotesEl) projectNotesEl.value = state.notes; }
        }
        renderList(); drawOverlay(); drawTimeline();
      }catch(err){ alert('Failed to load annotations: '+ err.message); }
    });
  }

  // Save/Load full project
  if (saveProjectBtn){
    saveProjectBtn.addEventListener('click', ()=>{
      const data = {
        version: 3,
        notes: state.notes || '',
        margin: parseFloat(marginInput.value)||0,
        annotations: state.annotations,
        video: state.videoMeta || null,
      };
      const blob = new Blob([JSON.stringify(data,null,2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (state.videoMeta?.name ? state.videoMeta.name.replace(/\.[^.]+$/, '') + '-' : '') + 'project.vfa.json';
      document.body.appendChild(a);
      a.click(); a.remove();
    });
  }

  if (loadProjectInput){
    loadProjectInput.addEventListener('change', async (e)=>{
      const f = e.target.files?.[0]; if (!f) return;
      try{
        const text = await f.text();
        const data = JSON.parse(text);
        state.annotations = Array.isArray(data.annotations) ? data.annotations : [];
        if (typeof data.margin === 'number') marginInput.value = String(data.margin);
        state.notes = data.notes || '';
        if (projectNotesEl) projectNotesEl.value = state.notes;
        state.videoMeta = data.video || null;
        state.selectedIds.clear();
        renderList(); drawOverlay(); drawTimeline();
        if (!video.src){
          showPlaceholder();
          if (state.videoMeta?.name){
            alert('Project loaded. Please load the referenced video file: ' + state.videoMeta.name);
          }
        } else {
          hidePlaceholder();
        }
        requestAnimationFrame(()=>{ resizeOverlay(); });
        setMode('select');
      }catch(err){ alert('Failed to load project: ' + err.message); }
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', ()=>{
      if (state.annotations.length===0) return;
      if (confirm('Delete all annotations?')){
        state.annotations = [];
        renderList(); drawOverlay();
      }
    });
  }

  // Export dialog flow
  function buildExportList(){
    exportListEl.innerHTML = '';
    let items = [...state.annotations].sort((a,b)=>a.time-b.time);
    if (expUseRangeChk?.checked && (state.markIn!=null || state.markOut!=null)){
      const a = state.markIn!=null ? state.markIn : 0;
      const b = state.markOut!=null ? state.markOut : (video.duration||Infinity);
      items = items.filter(x=> x.time >= a && x.time <= b);
    }
    for (const it of items){
      const row = document.createElement('div'); row.className='export-item';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = expSelectAllChk?.checked ?? true; cb.dataset.id = it.id;
      const dot = document.createElement('span'); dot.className='dot'; dot.style.background = it.color || (it.type==='path'?'#e6b35a':'#5b9cff');
      const label = document.createElement('div'); label.innerHTML = `<div>${fmtTime(it.time)} <span class="muted">${it.type}${it.tag? ' • '+it.tag:''}</span></div>`;
      row.append(cb, dot, label);
      exportListEl.appendChild(row);
    }
  }

  function getSelectedExportItems(){
    const selectedIds = new Set([...exportListEl.querySelectorAll('input[type="checkbox"]')].filter(x=>x.checked).map(x=>x.dataset.id));
    const items = [...state.annotations].filter(a=> selectedIds.has(a.id)).sort((a,b)=>a.time-b.time);
    return items;
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', ()=>{
      exportDialog.showModal();
      expStatusEl.textContent = '';
      expSelectAllChk.checked = true; expUseRangeChk.checked = false; expIncludeNotesChk.checked = true;
      buildExportList();
    });
  }

  expSelectAllChk?.addEventListener('change', ()=>{
    exportListEl.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked = expSelectAllChk.checked);
  });
  expUseRangeChk?.addEventListener('change', buildExportList);

  expBuildPreviewBtn?.addEventListener('click', async ()=>{
    const items = getSelectedExportItems();
    if (items.length===0){ expStatusEl.textContent = 'Select at least one annotation.'; return; }
    exportPreviewEl.innerHTML='';
    expStatusEl.textContent = 'Building preview…';
    const margin = parseFloat(marginInput.value)||0;
    for (const a of items){
      const nearby = state.annotations.filter(p=>Math.abs(p.time - a.time) <= margin);
      const uniqById = new Map([a, ...nearby].map(p=>[p.id,p]));
      const annos = [...uniqById.values()];
      // eslint-disable-next-line no-await-in-loop
      const snap = await snapshotAt(a.time, annos, 480, 270).catch(err=>{ console.error(err); return null; });
      const div = document.createElement('div'); div.className='thumb';
      const title = document.createElement('div'); title.className='muted small'; title.textContent = fmtTime(a.time) + (a.tag? ' • '+a.tag:'');
      if (snap){ const img = document.createElement('img'); img.src = snap.dataUrl; div.appendChild(img); }
      div.appendChild(title);
      exportPreviewEl.appendChild(div);
    }
    expStatusEl.textContent = 'Preview ready.';
  });

  expSavePdfBtn?.addEventListener('click', async ()=>{
    try{
      const items = getSelectedExportItems();
      if (items.length===0){ expStatusEl.textContent = 'Select at least one annotation.'; return; }
      await exportPdf(items, { includeNotes: expIncludeNotesChk?.checked });
      expStatusEl.textContent = 'Saved PDF.';
    }catch(err){ console.error(err); expStatusEl.textContent = 'Export failed: '+err.message; }
  });

  // Transport controls
  const togglePlay = ()=>{
    if (video.paused) video.play().catch(()=>{}); else video.pause();
    playPauseBtn.textContent = video.paused ? '▶' : '⏸';
  };
  if (playPauseBtn){
    playPauseBtn.addEventListener('click', togglePlay);
    video.addEventListener('play', ()=> playPauseBtn.textContent='⏸');
    video.addEventListener('pause', ()=> playPauseBtn.textContent='▶');
  }
  // HUD reflect play state
  function flashCenter(icon){
    if (!centerStatus) return;
    centerStatus.textContent = icon;
    centerStatus.classList.add('show');
    clearTimeout(centerStatus._t);
    centerStatus._t = setTimeout(()=> centerStatus.classList.remove('show'), 350);
  }
  video.addEventListener('play', ()=>{ flashCenter('⏵'); miniToggle && (miniToggle.textContent='⏸'); });
  video.addEventListener('pause', ()=>{ flashCenter('⏸'); miniToggle && (miniToggle.textContent='⏵'); });
  const clampTime = (t)=> Math.max(0, Math.min((video.duration||0), t));
  const stepBy = (delta)=>{ video.currentTime = clampTime((video.currentTime||0) + delta); };

  function stepSizeSec(elapsedMs){
    if (elapsedMs < 300) return state.frameStep;  // ~1 frame
    if (elapsedMs < 1500) return 0.10;            // 0.10 s
    if (elapsedMs < 4000) return 0.15;            // 0.15 s
    return 0.25;                                  // cap at 0.25 s
  }
  function startSeek(dir){
    clearInterval(state.seek.timer); state.seek.timer=null;
    state.seek.dir = dir; state.seek.start = performance.now();
    state.seek.timer = setInterval(()=>{
      const now = performance.now();
      stepBy(stepSizeSec(now - state.seek.start) * dir);
    }, 80);
  }
  function startSeekAfterDelay(dir, delayMs){
    clearTimeout(state.seek.holdTimer); state.seek.holdTimer = setTimeout(()=> startSeek(dir), delayMs);
  }
  function stopSeek(){
    clearTimeout(state.seek.holdTimer); state.seek.holdTimer=null;
    clearInterval(state.seek.timer); state.seek.timer=null; state.seek.dir=0;
  }
  // Buttons: single fine step on press; accelerate on hold
  if (stepBackBtn){
    stepBackBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); video.pause(); stepBy(-0.25); startSeekAfterDelay(-1, 250); });
    stepBackBtn.addEventListener('mouseup', stopSeek);
    stepBackBtn.addEventListener('mouseleave', stopSeek);
  }
  if (stepFwdBtn){
    stepFwdBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); video.pause(); stepBy(+0.25); startSeekAfterDelay(+1, 250); });
    stepFwdBtn.addEventListener('mouseup', stopSeek);
    stepFwdBtn.addEventListener('mouseleave', stopSeek);
  }
  function prevNextAnnotation(dir){
    const t = video.currentTime||0;
    const times = state.annotations.map(a=>a.time).sort((a,b)=>a-b);
    if (!times.length) return;
    if (dir<0){
      const prev = [...times].reverse().find(x=>x < t - 1e-3);
      if (prev!=null) video.currentTime = prev; else video.currentTime = times[0];
    } else {
      const next = times.find(x=>x > t + 1e-3);
      if (next!=null) video.currentTime = next; else video.currentTime = times[times.length-1];
    }
  }
  if (prevAnnBtn) prevAnnBtn.addEventListener('click', ()=> prevNextAnnotation(-1));
  if (nextAnnBtn) nextAnnBtn.addEventListener('click', ()=> prevNextAnnotation(+1));

  // Keyboard shortcuts (LosslessCut-like)
  document.addEventListener('keydown', (e)=>{
    if (e.target && ['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code==='Space'){ e.preventDefault(); togglePlay(); }
    else if (e.key==='ArrowLeft'){
      e.preventDefault();
      video.pause();
      if (e.shiftKey) { stepBy(-1); return; }
      if (!state.seek.timer) { stepBy(-0.25); startSeekAfterDelay(-1, 200); }
    }
    else if (e.key==='ArrowRight'){
      e.preventDefault();
      video.pause();
      if (e.shiftKey) { stepBy(+1); return; }
      if (!state.seek.timer) { stepBy(+0.25); startSeekAfterDelay(+1, 200); }
    }
    else if (e.key==='a' || e.key==='A'){ prevNextAnnotation(-1); }
    else if (e.key==='d' || e.key==='D'){ prevNextAnnotation(+1); }
    else if (e.key==='s' || e.key==='S'){ setMode('select'); }
    else if (e.key==='m' || e.key==='M'){ setMode('pin'); }
    else if (e.key==='b' || e.key==='B'){ setMode('draw'); }
    else if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); (saveJsonBtn || saveProjectBtn)?.click(); }
    else if (e.key==='i' || e.key==='I'){ state.markIn = video.currentTime||0; drawTimeline(); }
    else if (e.key==='o' || e.key==='O'){ state.markOut = video.currentTime||0; drawTimeline(); }
    else if (e.key==='x' || e.key==='X'){ state.markIn = null; state.markOut = null; drawTimeline(); }
  });
  document.addEventListener('keyup', (e)=>{
    if (e.key==='ArrowLeft' || e.key==='ArrowRight') stopSeek();
  });

  // Mini-controls wire-up
  miniBack?.addEventListener('click', (e)=>{ e.preventDefault(); video.pause(); stepBy(-0.25); });
  miniFwd?.addEventListener('click', (e)=>{ e.preventDefault(); video.pause(); stepBy(+0.25); });
  miniToggle?.addEventListener('click', (e)=>{ e.preventDefault(); togglePlay(); });

  // Splitter: resize sidebar width with persistent setting
  if (splitter){
    const root = document.documentElement;
    const saved = localStorage.getItem('vfa_sidebar_width');
    if (saved) root.style.setProperty('--sidebar-width', saved);
    let dragging = false; let startX=0; let startW=0;
    const onMove = (e)=>{
      if (!dragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(240, Math.min(720, startW - dx));
      root.style.setProperty('--sidebar-width', newW + 'px');
    };
    const onUp = ()=>{
      if (!dragging) return;
      dragging=false;
      localStorage.setItem('vfa_sidebar_width', getComputedStyle(root).getPropertyValue('--sidebar-width').trim());
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    splitter.addEventListener('mousedown', (e)=>{
      dragging = true; startX = e.clientX; startW = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-width')) || 380;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  // Click video to play/pause (custom controls only)
  // Keep Shift+click Quick Pin handler above; this handles plain clicks.
  video.addEventListener('click', (e)=>{
    if (e.shiftKey) return; // handled by quick pin
    if (state.mode !== 'select') return;
    // toggle using our transport logic
    if (video.paused) video.play().catch(()=>{}); else video.pause();
  });

  // Click near a timeline marker to jump
  if (timelineCanvas){
    timelineCanvas.addEventListener('click', (e)=>{
      const r = timelineCanvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const { start, end } = visibleRange();
      const span = Math.max(0.001, end-start);
      const width = r.width;
      const toX = (time)=> width * (time - start) / span;
      let best = null, bestD = Infinity;
      for (const a of state.annotations){
        if (a.time < start || a.time > end) continue;
        const d = Math.abs(toX(a.time) - x);
        if (d < bestD){ bestD = d; best = a.time; }
      }
      if (best!=null && bestD <= 8){ video.currentTime = best; drawTimeline(); }
    });
  }

  // Drag & drop video support
  const dropZone = document.getElementById('dropZone');
  if (dropZone){
    ['dragenter','dragover'].forEach(evt=>dropZone.addEventListener(evt, e=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; }));
    dropZone.addEventListener('drop', (e)=>{
      e.preventDefault();
      const f = [...(e.dataTransfer?.files||[])].find(ff=>ff.type.startsWith('video/'));
      if (!f) return;
      const url = URL.createObjectURL(f);
      video.src = url;
      video.load();
      // do not autoplay on load
      state.videoMeta = { name:f.name, type:f.type, size:f.size, lastModified:f.lastModified };
      hidePlaceholder();
    });
  }

  // Initial
  setMode('select');
  if (widthInput && widthVal) widthVal.textContent = (widthInput.value||'3') + 'px';
  renderList();
  drawTimeline();
})();
