/**
 * ==========================================================================
 * TOOLGENIC — COMPRESS IMAGE ENGINE
 * --------------------------------------------------------------------------
 * 100% client-side. No file ever leaves the browser. Built as small,
 * independent modules inside one IIFE. Every module checks for its DOM
 * hooks before wiring up, so this script fails silently (never throws)
 * if run on a page that doesn't have this tool's markup.
 *
 * Known browser limitations (documented rather than faked):
 *  - Progressive JPEG and chroma subsampling are not controllable through
 *    the Canvas API. The checkboxes are wired and stored in settings for
 *    forward-compatibility, but the actual encoding behaviour depends on
 *    the browser's built-in encoder.
 *  - AVIF encoding via canvas.toBlob is only available in browsers that
 *    ship an AVIF encoder; this is feature-detected at runtime.
 *  - HEIC/HEIF decoding is only available in browsers that can already
 *    render it natively (e.g. via <img>); most cannot, and the user is
 *    told so instead of the tool silently failing.
 * ==========================================================================
 */
(() => {
  'use strict';

  /* ========================================================================
     0. DOM HOOKS — bail out early if this isn't the compress-image page
     ==================================================================== */

  const uploadZone = document.getElementById('ci-upload-zone');
  if (!uploadZone) return; // Not on this page — do nothing.

  const $ = (id) => document.getElementById(id);
  const $all = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const fileInput = $('ci-file-input');
  const browseBtn = $('ci-browse-btn');
  const errorBanner = $('ci-error-banner');
  const workspace = $('ci-workspace');
  const batchList = $('ci-batch-list');
  const batchCount = $('ci-batch-count');
  const clearAllBtn = $('ci-clear-all-btn');

  const qualitySlider = $('ci-quality-slider');
  const qualityInput = $('ci-quality-input');
  const presetButtons = $all('.ci-preset-btn');

  const targetButtons = $all('.ci-target-btn');
  const customTargetInput = $('ci-custom-target');
  const customTargetUnit = $('ci-custom-target-unit');
  const targetClearBtn = $('ci-target-clear-btn');

  const resizeModeRadios = $all('input[name="ci-resize-mode"]');
  const widthInput = $('ci-width-input');
  const heightInput = $('ci-height-input');
  const lockAspectBtn = $('ci-lock-aspect-btn');
  const percentageSlider = $('ci-percentage-slider');
  const percentageInput = $('ci-percentage-input');

  const dpiSelect = $('ci-dpi-select');
  const formatSelect = $('ci-format-select');
  const formatNote = $('ci-format-note');

  const preserveMetadataChk = $('ci-preserve-metadata');
  const removeMetadataChk = $('ci-remove-metadata');
  const progressiveChk = $('ci-progressive-jpeg');
  const optimizeColorsChk = $('ci-optimize-colors');
  const chromaChk = $('ci-chroma-subsampling');
  const preserveTransparencyChk = $('ci-preserve-transparency');
  const resetBtn = $('ci-reset-btn');

  const viewSliderBtn = $('ci-view-slider-btn');
  const viewSideBtn = $('ci-view-side-btn');
  const sliderView = $('ci-slider-view');
  const sideView = $('ci-side-view');
  const zoomSlider = $('ci-zoom-slider');
  const zoomValue = $('ci-zoom-value');

  const originalImg = $('ci-original-img');
  const compressedClip = $('ci-compressed-clip');
  const compressedImg = $('ci-compressed-img');
  const compareHandle = $('ci-compare-handle');
  const compareFrame = $('ci-compare-frame');
  const sideOriginalImg = $('ci-side-original-img');
  const sideCompressedImg = $('ci-side-compressed-img');
  const previewPlaceholder = $('ci-preview-placeholder');

  const infoFilename = $('ci-info-filename');
  const infoFormat = $('ci-info-format');
  const infoDimensions = $('ci-info-dimensions');
  const infoAspect = $('ci-info-aspect');
  const infoDpi = $('ci-info-dpi');
  const infoProfile = $('ci-info-profile');

  const resultOriginalSize = $('ci-result-original-size');
  const resultNewSize = $('ci-result-new-size');
  const resultSavedPercent = $('ci-result-saved-percent');
  const resultRatio = $('ci-result-ratio');
  const resultDimensions = $('ci-result-dimensions');
  const resultSpeed = $('ci-result-speed');

  const renameInput = $('ci-rename-input');
  const downloadBtn = $('ci-download-btn');
  const downloadAllBtn = $('ci-download-all-btn');
  const copyBtn = $('ci-copy-btn');

  /* ========================================================================
     1. UTILITIES
     ==================================================================== */

  const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40MB per file — generous but bounded.
  const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp', 'gif', 'heic', 'heif'];

  const debounce = (fn, wait = 150) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const greatestCommonDivisor = (a, b) => (b === 0 ? a : greatestCommonDivisor(b, a % b));

  const formatAspectRatio = (width, height) => {
    if (!width || !height) return '—';
    const divisor = greatestCommonDivisor(width, height) || 1;
    const w = width / divisor;
    const h = height / divisor;
    if (w <= 40 && h <= 40) return `${w}:${h}`;
    return `${(width / height).toFixed(2)}:1`;
  };

  const extensionFromName = (name) => (name.split('.').pop() || '').toLowerCase();

  const mimeToLabel = (mime, fallbackExt) => {
    const map = {
      'image/jpeg': 'JPEG',
      'image/png': 'PNG',
      'image/webp': 'WebP',
      'image/avif': 'AVIF',
      'image/bmp': 'BMP',
      'image/gif': 'GIF',
      'image/heic': 'HEIC',
      'image/heif': 'HEIF',
    };
    return map[mime] || (fallbackExt ? fallbackExt.toUpperCase() : 'Unknown');
  };

  const extensionForMime = (mime) => {
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif',
    };
    return map[mime] || 'jpg';
  };

  let idCounter = 0;
  const nextId = () => `ci-${Date.now()}-${idCounter++}`;

  /* ========================================================================
     2. ERROR BANNER
     ==================================================================== */

  const ErrorManager = (() => {
    let hideTimer = null;

    const show = (message) => {
      if (!errorBanner) return;
      errorBanner.dataset.message = message;
      errorBanner.hidden = false;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        errorBanner.hidden = true;
      }, 6000);
    };

    return { show };
  })();

  /* ========================================================================
     3. METADATA PARSER — DPI, EXIF, color profile (best-effort, read-only)
     ==================================================================== */

  const MetadataParser = (() => {
    const readUint16BE = (view, offset) => view.getUint16(offset, false);

    /** Parses a JPEG ArrayBuffer for JFIF DPI, an EXIF (APP1) segment, and ICC presence. */
    const parseJPEG = (buffer) => {
      const view = new DataView(buffer);
      const result = { dpi: null, exifSegment: null, hasICC: false };
      if (view.byteLength < 4 || readUint16BE(view, 0) !== 0xffd8) return result;

      let offset = 2;
      while (offset < view.byteLength - 4) {
        const marker = readUint16BE(view, offset);
        if ((marker & 0xff00) !== 0xff00) break; // Not a marker — stop parsing.
        if (marker === 0xffd9 || marker === 0xffda) break; // EOI or start of scan.

        const segmentLength = readUint16BE(view, offset + 2);
        const dataStart = offset + 4;

        if (marker === 0xffe0 && segmentLength >= 14) {
          // APP0 / JFIF — units(1) at +7, Xdensity(2) at +8 relative to dataStart-2... 
          // Layout after length field: "JFIF\0"(5) ver(2) units(1) Xdensity(2) Ydensity(2)
          const units = view.getUint8(dataStart + 7);
          const xDensity = readUint16BE(view, dataStart + 8);
          if (units === 1 && xDensity > 0) result.dpi = xDensity; // 1 = dots per inch
        }

        if (marker === 0xffe1 && segmentLength >= 6) {
          // APP1 — check for "Exif\0\0" identifier before treating as EXIF.
          const isExif =
            view.getUint8(dataStart) === 0x45 && // E
            view.getUint8(dataStart + 1) === 0x78 && // x
            view.getUint8(dataStart + 2) === 0x69 && // i
            view.getUint8(dataStart + 3) === 0x66; // f
          if (isExif) {
            result.exifSegment = new Uint8Array(buffer, offset, segmentLength + 2);
          }
        }

        if (marker === 0xffe2) {
          result.hasICC = true;
        }

        offset += 2 + segmentLength;
      }

      return result;
    };

    /** Parses a PNG ArrayBuffer for a pHYs DPI chunk and iCCP presence. */
    const parsePNG = (buffer) => {
      const view = new DataView(buffer);
      const result = { dpi: null, hasICC: false };
      if (view.byteLength < 8) return result;

      let offset = 8; // Skip PNG signature.
      while (offset < view.byteLength - 8) {
        const length = view.getUint32(offset, false);
        const type = String.fromCharCode(
          view.getUint8(offset + 4),
          view.getUint8(offset + 5),
          view.getUint8(offset + 6),
          view.getUint8(offset + 7)
        );

        if (type === 'pHYs' && length >= 9) {
          const ppuX = view.getUint32(offset + 8, false);
          const unitSpecifier = view.getUint8(offset + 16);
          if (unitSpecifier === 1 && ppuX > 0) {
            result.dpi = Math.round(ppuX * 0.0254);
          }
        }

        if (type === 'iCCP') result.hasICC = true;
        if (type === 'IDAT') break; // Metadata chunks come before image data.

        offset += 12 + length; // length + type(4) + data(length) + crc(4)
      }

      return result;
    };

    /** Reads the first ~256KB of a file (enough for header metadata) and parses it. */
    const readMetadata = (file) =>
      new Promise((resolve) => {
        const slice = file.slice(0, 262144);
        const reader = new FileReader();
        reader.onload = () => {
          try {
            if (file.type === 'image/jpeg') {
              resolve(parseJPEG(reader.result));
            } else if (file.type === 'image/png') {
              resolve(parsePNG(reader.result));
            } else {
              resolve({ dpi: null, exifSegment: null, hasICC: false });
            }
          } catch (err) {
            resolve({ dpi: null, exifSegment: null, hasICC: false });
          }
        };
        reader.onerror = () => resolve({ dpi: null, exifSegment: null, hasICC: false });
        reader.readAsArrayBuffer(slice);
      });

    return { readMetadata };
  })();

  /* ========================================================================
     4. COMPRESSION ENGINE — canvas drawing, encoding, target-size search
     ==================================================================== */

  const CompressionEngine = (() => {
    /** Wraps canvas.toBlob in a Promise. */
    const canvasToBlob = (canvas, mime, quality) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed in this browser.'))),
          mime,
          quality
        );
      });

    /** Draws a bitmap onto a canvas at the given size, applying color optimization if requested. */
    const drawToCanvas = (bitmap, width, height, { optimizeColors, preserveTransparency, mime }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: mime === 'image/png' || mime === 'image/webp' });

      if (!preserveTransparency || mime === 'image/jpeg') {
        // JPEG has no alpha channel — flatten onto white to avoid black backgrounds.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);

      if (optimizeColors && mime === 'image/png') {
        // Lightweight posterization — reduces unique colors so PNG's
        // lossless compressor has more repetition to work with.
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const STEP = 16;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.round(data[i] / STEP) * STEP;
          data[i + 1] = Math.round(data[i + 1] / STEP) * STEP;
          data[i + 2] = Math.round(data[i + 2] / STEP) * STEP;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      return canvas;
    };

    /** Binary-searches quality (0.02–0.98) to land at or under targetBytes. Lossy formats only. */
    const searchQualityForTarget = async (canvas, mime, targetBytes) => {
      let lo = 0.02;
      let hi = 0.98;
      let best = await canvasToBlob(canvas, mime, hi);

      for (let i = 0; i < 8; i += 1) {
        const mid = (lo + hi) / 2;
        const blob = await canvasToBlob(canvas, mime, mid);
        if (blob.size > targetBytes) {
          hi = mid;
        } else {
          best = blob;
          lo = mid;
        }
      }
      return best;
    };

    /**
     * Produces a blob at or under targetBytes, first via quality search, then by
     * progressively downscaling dimensions if quality alone can't reach the target
     * (this is also the only path available for PNG, which has no quality knob).
     */
    const compressToTargetSize = async (bitmap, baseWidth, baseHeight, settings, targetBytes) => {
      let scale = 1;
      let result = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const width = Math.max(1, Math.round(baseWidth * scale));
        const height = Math.max(1, Math.round(baseHeight * scale));
        const canvas = drawToCanvas(bitmap, width, height, settings);

        let blob;
        if (settings.mime === 'image/png') {
          blob = await canvasToBlob(canvas, settings.mime);
        } else {
          blob = await searchQualityForTarget(canvas, settings.mime, targetBytes);
        }

        result = { blob, width, height };
        if (blob.size <= targetBytes || scale <= 0.12) break;
        scale *= 0.8;
      }

      return result;
    };

    /** Injects (or overwrites) JFIF DPI density in a JPEG blob's APP0 segment. */
    const writeJpegDpi = async (blob, dpi) => {
      const buffer = await blob.arrayBuffer();
      const view = new DataView(buffer);
      if (view.getUint16(0, false) !== 0xffd8) return blob;

      // Canvas-encoded JPEGs always start with an APP0/JFIF segment.
      if (view.getUint16(2, false) === 0xffe0) {
        view.setUint8(2 + 4 + 7, 1); // units = 1 (dots per inch)
        view.setUint16(2 + 4 + 8, dpi, false); // Xdensity
        view.setUint16(2 + 4 + 10, dpi, false); // Ydensity
        return new Blob([buffer], { type: 'image/jpeg' });
      }
      return blob;
    };

    /** Injects a pHYs chunk into a PNG blob to reflect the chosen DPI. */
    const writePngDpi = async (blob, dpi) => {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const ppu = Math.round(dpi / 0.0254);

      // Build a pHYs chunk: length(4) + "pHYs"(4) + ppuX(4) + ppuY(4) + unit(1) + crc(4)
      const chunkData = new Uint8Array(9);
      const dv = new DataView(chunkData.buffer);
      dv.setUint32(0, ppu, false);
      dv.setUint32(4, ppu, false);
      chunkData[8] = 1; // meters

      const typeAndData = new Uint8Array(4 + 9);
      typeAndData.set([0x70, 0x48, 0x59, 0x73], 0); // "pHYs"
      typeAndData.set(chunkData, 4);
      const crc = crc32(typeAndData);

      const chunk = new Uint8Array(4 + 4 + 9 + 4);
      new DataView(chunk.buffer).setUint32(0, 9, false);
      chunk.set(typeAndData, 4);
      new DataView(chunk.buffer).setUint32(4 + 4 + 9, crc, false);

      // Insert immediately after the IHDR chunk (signature[8] + IHDR length/type/data/crc = 8+25).
      const insertAt = 8 + 25;
      const merged = new Uint8Array(bytes.length + chunk.length);
      merged.set(bytes.subarray(0, insertAt), 0);
      merged.set(chunk, insertAt);
      merged.set(bytes.subarray(insertAt), insertAt + chunk.length);

      return new Blob([merged], { type: 'image/png' });
    };

    /** Splices a captured EXIF (APP1) segment from the original file into a new JPEG blob. */
    const reinjectExif = async (blob, exifSegment) => {
      if (!exifSegment) return blob;
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Insert right after SOI (FFD8), ahead of the encoder's own APP0.
      const merged = new Uint8Array(2 + exifSegment.length + (bytes.length - 2));
      merged.set(bytes.subarray(0, 2), 0);
      merged.set(exifSegment, 2);
      merged.set(bytes.subarray(2), 2 + exifSegment.length);
      return new Blob([merged], { type: 'image/jpeg' });
    };

    // Minimal CRC32 implementation (needed only for the pHYs chunk we author).
    let crcTable = null;
    function crc32(bytes) {
      if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
          let c = n;
          for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
          }
          crcTable[n] = c;
        }
      }
      let crc = 0xffffffff;
      for (let i = 0; i < bytes.length; i += 1) {
        crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    }

    /** Detects whether the browser can actually encode a given mime via canvas.toBlob. */
    const detectEncodeSupport = async (mime) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const blob = await canvasToBlob(canvas, mime, 0.8);
        return !!blob && blob.type === mime;
      } catch (err) {
        return false;
      }
    };

    return {
      drawToCanvas,
      canvasToBlob,
      compressToTargetSize,
      writeJpegDpi,
      writePngDpi,
      reinjectExif,
      detectEncodeSupport,
    };
  })();

  /* ========================================================================
     5. IMAGE STORE — in-memory state for the batch
     ==================================================================== */

  const ImageStore = (() => {
    const items = new Map(); // id -> item
    let activeId = null;

    const add = (item) => items.set(item.id, item);
    const get = (id) => items.get(id);
    const remove = (id) => {
      const item = items.get(id);
      if (item) {
        URL.revokeObjectURL(item.originalUrl);
        if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
      }
      items.delete(id);
      if (activeId === id) activeId = items.size ? items.keys().next().value : null;
    };
    const clear = () => {
      items.forEach((item) => {
        URL.revokeObjectURL(item.originalUrl);
        if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
      });
      items.clear();
      activeId = null;
    };
    const all = () => Array.from(items.values());
    const setActive = (id) => {
      activeId = id;
    };
    const getActive = () => (activeId ? items.get(activeId) : null);
    const size = () => items.size;

    return { add, get, remove, clear, all, setActive, getActive, size };
  })();

  /* ========================================================================
     6. UPLOADER — drag & drop, browse, paste, validation
     ==================================================================== */

  const Uploader = (() => {
    const validateFile = (file) => {
      const ext = extensionFromName(file.name);
      const looksLikeImage = file.type.startsWith('image/') || ACCEPTED_EXTENSIONS.includes(ext);

      if (!looksLikeImage) {
        ErrorManager.show(`"${file.name}" doesn't look like a supported image format.`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        ErrorManager.show(`"${file.name}" is too large (max ${formatBytes(MAX_FILE_SIZE)} per file).`);
        return false;
      }
      return true;
    };

    /** Decodes a File into an ImageBitmap, with a friendly message on failure (e.g. unsupported HEIC). */
    const decodeImage = async (file) => {
      try {
        return await createImageBitmap(file);
      } catch (err) {
        const ext = extensionFromName(file.name);
        if (ext === 'heic' || ext === 'heif') {
          ErrorManager.show(
            `"${file.name}" is a HEIC/HEIF file. Your browser can't decode it directly — try our HEIC to JPG tool first.`
          );
        } else {
          ErrorManager.show(`"${file.name}" appears to be corrupted or in an unsupported format.`);
        }
        return null;
      }
    };

    const processFiles = async (fileList) => {
      const files = Array.from(fileList).filter(validateFile);
      if (!files.length) return;

      for (const file of files) {
        const bitmap = await decodeImage(file);
        if (!bitmap) continue;

        const meta = await MetadataParser.readMetadata(file);

        const item = {
          id: nextId(),
          file,
          bitmap,
          originalUrl: URL.createObjectURL(file),
          width: bitmap.width,
          height: bitmap.height,
          originalSize: file.size,
          mime: file.type || `image/${extensionFromName(file.name)}`,
          dpi: meta.dpi,
          exifSegment: meta.exifSegment || null,
          hasICC: meta.hasICC || false,
          outputName: file.name.replace(/\.[^/.]+$/, ''),
          compressedBlob: null,
          compressedUrl: null,
          compressedWidth: null,
          compressedHeight: null,
        };

        ImageStore.add(item);
        BatchList.renderItem(item);
      }

      workspace.hidden = false;
      BatchList.updateCount();

      if (!ImageStore.getActive() && ImageStore.size()) {
        const first = ImageStore.all()[0];
        BatchList.selectItem(first.id);
      }
    };

    const init = () => {
      browseBtn?.addEventListener('click', () => fileInput?.click());
      uploadZone.addEventListener('click', (event) => {
        if (event.target === uploadZone || event.target.closest('.ci-upload-icon, .ci-upload-title')) {
          fileInput?.click();
        }
      });
      uploadZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileInput?.click();
        }
      });

      fileInput?.addEventListener('change', (event) => {
        processFiles(event.target.files);
        fileInput.value = ''; // Allow re-selecting the same file later.
      });

      ['dragenter', 'dragover'].forEach((eventName) => {
        uploadZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          uploadZone.classList.add('ci-upload-zone--dragover');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        uploadZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          uploadZone.classList.remove('ci-upload-zone--dragover');
        });
      });

      uploadZone.addEventListener('drop', (event) => {
        if (event.dataTransfer?.files?.length) processFiles(event.dataTransfer.files);
      });

      document.addEventListener('paste', (event) => {
        const pastedFiles = Array.from(event.clipboardData?.items || [])
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter(Boolean);
        if (pastedFiles.length) processFiles(pastedFiles);
      });
    };

    return { init, processFiles };
  })();

  /* ========================================================================
     7. BATCH LIST — render, select, remove, clear
     ==================================================================== */

  const BatchList = (() => {
    const renderItem = (item) => {
      const li = document.createElement('li');
      li.className = 'ci-batch-item';
      li.dataset.id = item.id;
      li.innerHTML = `
        <img class="ci-batch-thumb" src="${item.originalUrl}" alt="" aria-hidden="true">
        <div class="ci-batch-info">
          <span class="ci-batch-name"></span>
          <span class="ci-batch-meta"></span>
          <div class="ci-batch-progress"><div class="ci-batch-progress-bar"></div></div>
        </div>
        <div class="ci-batch-actions">
          <button type="button" class="ci-batch-icon-btn" data-action="download" aria-label="Download this image" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="ci-batch-icon-btn" data-action="remove" aria-label="Remove this image">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      `;
      li.querySelector('.ci-batch-name').textContent = item.file.name;
      li.querySelector('.ci-batch-meta').textContent = `${formatBytes(item.originalSize)} · ${item.width}×${item.height}`;

      li.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="remove"]')) {
          removeItem(item.id);
          return;
        }
        if (event.target.closest('[data-action="download"]')) {
          ActionsManager.downloadItem(item.id);
          return;
        }
        selectItem(item.id);
      });

      batchList.appendChild(li);
    };

    const setProgress = (id, percent, processing) => {
      const li = batchList.querySelector(`[data-id="${id}"]`);
      if (!li) return;
      li.classList.toggle('ci-batch-item--processing', processing);
      const bar = li.querySelector('.ci-batch-progress-bar');
      if (bar) bar.style.width = `${percent}%`;
    };

    const updateMeta = (item) => {
      const li = batchList.querySelector(`[data-id="${item.id}"]`);
      if (!li) return;
      const metaEl = li.querySelector('.ci-batch-meta');
      const downloadBtnEl = li.querySelector('[data-action="download"]');
      if (item.compressedBlob) {
        metaEl.textContent = `${formatBytes(item.originalSize)} → ${formatBytes(item.compressedBlob.size)} · ${item.compressedWidth}×${item.compressedHeight}`;
        downloadBtnEl.disabled = false;
      } else {
        metaEl.textContent = `${formatBytes(item.originalSize)} · ${item.width}×${item.height}`;
      }
    };

    const selectItem = (id) => {
      ImageStore.setActive(id);
      $all('.ci-batch-item', batchList).forEach((li) => {
        li.classList.toggle('ci-batch-item--active', li.dataset.id === id);
      });
      PreviewController.loadActiveItem();
    };

    const removeItem = (id) => {
      const wasActive = ImageStore.getActive()?.id === id;
      ImageStore.remove(id);
      batchList.querySelector(`[data-id="${id}"]`)?.remove();
      updateCount();

      if (!ImageStore.size()) {
        workspace.hidden = true;
        PreviewController.showPlaceholder();
        return;
      }
      if (wasActive) {
        selectItem(ImageStore.all()[0].id);
      }
    };

    const updateCount = () => {
      if (batchCount) batchCount.textContent = String(ImageStore.size());
    };

    const init = () => {
      clearAllBtn?.addEventListener('click', () => {
        ImageStore.clear();
        batchList.innerHTML = '';
        updateCount();
        workspace.hidden = true;
        PreviewController.showPlaceholder();
      });
    };

    return { renderItem, setProgress, updateMeta, selectItem, removeItem, updateCount, init };
  })();

  /* ========================================================================
     8. CONTROLS PANEL — reads/writes all compression settings
     ==================================================================== */

  const ControlsPanel = (() => {
    const DEFAULTS = {
      quality: 70,
      targetKB: null,
      resizeMode: 'original',
      width: null,
      height: null,
      percentage: 100,
      lockAspect: true,
      dpi: 0,
      mime: 'image/jpeg',
      preserveMetadata: false,
      progressive: false,
      optimizeColors: false,
      chromaSubsampling: true,
      preserveTransparency: true,
    };

    let aspectRatio = 1;

    const getSettings = () => {
      const targetBytesFromCustom = () => {
        const raw = parseFloat(customTargetInput.value);
        if (!raw || raw <= 0) return null;
        return customTargetUnit.value === 'MB' ? raw * 1024 * 1024 : raw * 1024;
      };

      const activeTargetBtn = targetButtons.find((btn) => btn.classList.contains('ci-target-btn--active'));
      const targetBytes = activeTargetBtn
        ? Number(activeTargetBtn.dataset.targetKb) * 1024
        : targetBytesFromCustom();

      return {
        quality: clamp(Number(qualityInput.value) || 70, 1, 100) / 100,
        targetBytes,
        resizeMode: resizeModeRadios.find((r) => r.checked)?.value || 'original',
        width: Number(widthInput.value) || null,
        height: Number(heightInput.value) || null,
        percentage: clamp(Number(percentageInput.value) || 100, 1, 100),
        lockAspect: lockAspectBtn.getAttribute('aria-pressed') === 'true',
        dpi: Number(dpiSelect.value) || 0,
        mime: formatSelect.value,
        preserveMetadata: preserveMetadataChk.checked,
        progressive: progressiveChk.checked,
        optimizeColors: optimizeColorsChk.checked,
        chromaSubsampling: chromaChk.checked,
        preserveTransparency: preserveTransparencyChk.checked,
      };
    };

    /** Computes the output pixel dimensions for the active item given current settings. */
    const computeDimensions = (item) => {
      const settings = getSettings();
      if (settings.resizeMode === 'dimensions' && (settings.width || settings.height)) {
        if (settings.width && !settings.height) {
          return { width: settings.width, height: Math.round(settings.width / aspectRatio) };
        }
        if (settings.height && !settings.width) {
          return { width: Math.round(settings.height * aspectRatio), height: settings.height };
        }
        return { width: settings.width, height: settings.height };
      }
      if (settings.resizeMode === 'percentage') {
        return {
          width: Math.max(1, Math.round(item.width * (settings.percentage / 100))),
          height: Math.max(1, Math.round(item.height * (settings.percentage / 100))),
        };
      }
      return { width: item.width, height: item.height };
    };

    const setPreset = (quality) => {
      qualitySlider.value = quality;
      qualityInput.value = quality;
      presetButtons.forEach((btn) => {
        btn.classList.toggle('ci-preset-btn--active', Number(btn.dataset.quality) === quality);
      });
    };

    const clearTargetSelection = () => {
      targetButtons.forEach((btn) => btn.classList.remove('ci-target-btn--active'));
      customTargetInput.value = '';
    };

    const syncQualityInputs = (value) => {
      const clamped = clamp(Number(value) || 1, 1, 100);
      qualitySlider.value = clamped;
      qualityInput.value = clamped;
      presetButtons.forEach((btn) => {
        btn.classList.toggle('ci-preset-btn--active', Number(btn.dataset.quality) === clamped);
      });
    };

    const updateFormatNote = () => {
      const mime = formatSelect.value;
      if (mime === 'image/avif') {
        formatNote.textContent = 'AVIF export depends on your browser — if unsupported, ToolGenic falls back to JPG automatically.';
        formatNote.hidden = false;
      } else if (mime === 'image/jpeg') {
        formatNote.textContent = 'Progressive encoding and chroma subsampling depend on your browser\u2019s built-in encoder and can\u2019t be forced from JavaScript.';
        formatNote.hidden = false;
      } else {
        formatNote.hidden = true;
      }
    };

    const setAspectRatio = (ratio) => {
      aspectRatio = ratio || 1;
    };

    const resetToDefaults = () => {
      syncQualityInputs(DEFAULTS.quality);
      clearTargetSelection();
      resizeModeRadios.forEach((r) => (r.checked = r.value === DEFAULTS.resizeMode));
      widthInput.value = '';
      heightInput.value = '';
      widthInput.disabled = true;
      heightInput.disabled = true;
      percentageSlider.value = 100;
      percentageInput.value = 100;
      percentageSlider.disabled = true;
      percentageInput.disabled = true;
      lockAspectBtn.setAttribute('aria-pressed', 'true');
      dpiSelect.value = '0';
      formatSelect.value = DEFAULTS.mime;
      preserveMetadataChk.checked = false;
      removeMetadataChk.checked = true;
      progressiveChk.checked = false;
      optimizeColorsChk.checked = false;
      chromaChk.checked = true;
      preserveTransparencyChk.checked = true;
      updateFormatNote();
    };

    const wireEvents = (onChange) => {
      const notify = debounce(onChange, 200);

      // Quality slider <-> numeric input, kept in sync both ways.
      qualitySlider.addEventListener('input', () => {
        qualityInput.value = qualitySlider.value;
        presetButtons.forEach((btn) => btn.classList.remove('ci-preset-btn--active'));
        clearTargetSelection();
        notify();
      });
      qualityInput.addEventListener('input', () => {
        syncQualityInputs(qualityInput.value);
        clearTargetSelection();
        notify();
      });

      presetButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          setPreset(Number(btn.dataset.quality));
          clearTargetSelection();
          notify();
        });
      });

      // Target size presets and custom value.
      targetButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          targetButtons.forEach((b) => b.classList.remove('ci-target-btn--active'));
          btn.classList.add('ci-target-btn--active');
          customTargetInput.value = '';
          notify();
        });
      });
      customTargetInput.addEventListener('input', () => {
        targetButtons.forEach((b) => b.classList.remove('ci-target-btn--active'));
        notify();
      });
      customTargetUnit.addEventListener('change', notify);
      targetClearBtn.addEventListener('click', () => {
        clearTargetSelection();
        notify();
      });

      // Resize mode.
      resizeModeRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
          const mode = radio.value;
          widthInput.disabled = mode !== 'dimensions';
          heightInput.disabled = mode !== 'dimensions';
          percentageSlider.disabled = mode !== 'percentage';
          percentageInput.disabled = mode !== 'percentage';
          notify();
        });
      });

      widthInput.addEventListener('input', () => {
        if (lockAspectBtn.getAttribute('aria-pressed') === 'true' && widthInput.value) {
          heightInput.value = Math.round(Number(widthInput.value) / aspectRatio);
        }
        notify();
      });
      heightInput.addEventListener('input', () => {
        if (lockAspectBtn.getAttribute('aria-pressed') === 'true' && heightInput.value) {
          widthInput.value = Math.round(Number(heightInput.value) * aspectRatio);
        }
        notify();
      });
      lockAspectBtn.addEventListener('click', () => {
        const pressed = lockAspectBtn.getAttribute('aria-pressed') === 'true';
        lockAspectBtn.setAttribute('aria-pressed', String(!pressed));
      });

      percentageSlider.addEventListener('input', () => {
        percentageInput.value = percentageSlider.value;
        notify();
      });
      percentageInput.addEventListener('input', () => {
        percentageSlider.value = clamp(Number(percentageInput.value) || 1, 1, 100);
        notify();
      });

      dpiSelect.addEventListener('change', notify);

      formatSelect.addEventListener('change', () => {
        updateFormatNote();
        notify();
      });

      // Metadata checkboxes behave like a mutually-exclusive radio pair.
      preserveMetadataChk.addEventListener('change', () => {
        if (preserveMetadataChk.checked) removeMetadataChk.checked = false;
        notify();
      });
      removeMetadataChk.addEventListener('change', () => {
        if (removeMetadataChk.checked) preserveMetadataChk.checked = false;
        notify();
      });

      [progressiveChk, optimizeColorsChk, chromaChk, preserveTransparencyChk].forEach((chk) => {
        chk.addEventListener('change', notify);
      });

      resetBtn.addEventListener('click', () => {
        resetToDefaults();
        notify();
      });
    };

    const init = (onChange) => {
      updateFormatNote();
      wireEvents(onChange);
    };

    return { init, getSettings, computeDimensions, setAspectRatio, resetToDefaults };
  })();

  /* ========================================================================
     9. PREVIEW CONTROLLER — before/after slider, side-by-side, zoom
     ==================================================================== */

  const PreviewController = (() => {
    let zoomLevel = 1;

    const showPlaceholder = () => {
      previewPlaceholder.hidden = false;
      sliderView.hidden = true;
      sideView.hidden = true;
      downloadBtn.disabled = true;
      downloadAllBtn.disabled = true;
      copyBtn.disabled = true;
      [infoFilename, infoFormat, infoDimensions, infoAspect, infoDpi, infoProfile].forEach((el) => (el.textContent = '—'));
      [resultOriginalSize, resultNewSize, resultSavedPercent, resultRatio, resultDimensions, resultSpeed].forEach(
        (el) => (el.textContent = '—')
      );
    };

    const applyZoom = () => {
      const scale = zoomLevel;
      [originalImg, compressedImg, sideOriginalImg, sideCompressedImg].forEach((img) => {
        if (img) img.style.transform = `scale(${scale})`;
      });
    };

    const updateInfoPanel = (item) => {
      infoFilename.textContent = item.file.name;
      infoFormat.textContent = mimeToLabel(item.mime, extensionFromName(item.file.name));
      infoDimensions.textContent = `${item.width} × ${item.height}px`;
      infoAspect.textContent = formatAspectRatio(item.width, item.height);
      infoDpi.textContent = item.dpi ? `${item.dpi} DPI` : 'Not specified';
      infoProfile.textContent = item.hasICC ? 'Embedded ICC profile' : 'sRGB (assumed)';
    };

    const updateResultsPanel = (item) => {
      if (!item.compressedBlob) return;
      const originalSize = item.originalSize;
      const newSize = item.compressedBlob.size;
      const savedPercent = Math.max(0, Math.round((1 - newSize / originalSize) * 100));
      const ratio = originalSize / newSize;

      resultOriginalSize.textContent = formatBytes(originalSize);
      resultNewSize.textContent = formatBytes(newSize);
      resultSavedPercent.textContent = `${savedPercent}%`;
      resultRatio.textContent = `${ratio.toFixed(2)}:1`;
      resultDimensions.textContent = `${item.compressedWidth} × ${item.compressedHeight}px`;

      // Estimated download time improvement at a representative 5 Mbps connection.
      const BITRATE_BYTES_PER_SEC = (5 * 1024 * 1024) / 8;
      const originalTime = originalSize / BITRATE_BYTES_PER_SEC;
      const newTime = newSize / BITRATE_BYTES_PER_SEC;
      const savedSeconds = Math.max(0, originalTime - newTime);
      resultSpeed.textContent = savedSeconds >= 0.1 ? `${savedSeconds.toFixed(1)}s faster` : 'Negligible';
    };

    const renderPreviewImages = (item) => {
      originalImg.src = item.originalUrl;
      sideOriginalImg.src = item.originalUrl;
      if (item.compressedUrl) {
        compressedImg.src = item.compressedUrl;
        sideCompressedImg.src = item.compressedUrl;
      }
    };

    const loadActiveItem = () => {
      const item = ImageStore.getActive();
      if (!item) {
        showPlaceholder();
        return;
      }
      previewPlaceholder.hidden = true;
      sliderView.hidden = viewSideBtn.classList.contains('ci-view-btn--active');
      sideView.hidden = !sliderView.hidden ? true : sideView.hidden;

      ControlsPanel.setAspectRatio(item.width / item.height);
      renameInput.value = item.outputName;
      updateInfoPanel(item);
      renderPreviewImages(item);

      if (item.compressedBlob) {
        updateResultsPanel(item);
        downloadBtn.disabled = false;
        copyBtn.disabled = false;
      } else {
        downloadBtn.disabled = true;
        copyBtn.disabled = true;
      }
      downloadAllBtn.disabled = ImageStore.all().every((i) => !i.compressedBlob);
    };

    const setViewMode = (mode) => {
      const isSlider = mode === 'slider';
      sliderView.hidden = !isSlider;
      sideView.hidden = isSlider;
      viewSliderBtn.classList.toggle('ci-view-btn--active', isSlider);
      viewSliderBtn.setAttribute('aria-pressed', String(isSlider));
      viewSideBtn.classList.toggle('ci-view-btn--active', !isSlider);
      viewSideBtn.setAttribute('aria-pressed', String(!isSlider));
    };

    const setSliderPosition = (percent) => {
      const clamped = clamp(percent, 0, 100);
      compressedClip.style.width = `${clamped}%`;
      compareHandle.style.left = `${clamped}%`;
      compareHandle.setAttribute('aria-valuenow', String(Math.round(clamped)));
    };

    const wireCompareHandle = () => {
      let dragging = false;

      const moveTo = (clientX) => {
        const rect = compareFrame.getBoundingClientRect();
        const percent = ((clientX - rect.left) / rect.width) * 100;
        setSliderPosition(percent);
      };

      compareHandle.addEventListener('pointerdown', (event) => {
        dragging = true;
        compareHandle.setPointerCapture(event.pointerId);
      });
      compareHandle.addEventListener('pointermove', (event) => {
        if (dragging) moveTo(event.clientX);
      });
      compareHandle.addEventListener('pointerup', () => {
        dragging = false;
      });
      compareHandle.addEventListener('keydown', (event) => {
        const current = Number(compareHandle.getAttribute('aria-valuenow')) || 50;
        if (event.key === 'ArrowLeft') setSliderPosition(current - 5);
        if (event.key === 'ArrowRight') setSliderPosition(current + 5);
      });
      compareFrame.addEventListener('click', (event) => {
        if (event.target === compareHandle) return;
        moveTo(event.clientX);
      });
    };

    const init = () => {
      setSliderPosition(50);
      wireCompareHandle();

      viewSliderBtn.addEventListener('click', () => setViewMode('slider'));
      viewSideBtn.addEventListener('click', () => setViewMode('side'));

      zoomSlider.addEventListener('input', () => {
        zoomLevel = Number(zoomSlider.value) / 100;
        zoomValue.textContent = `${zoomSlider.value}%`;
        applyZoom();
      });

      showPlaceholder();
    };

    return { init, loadActiveItem, showPlaceholder, updateResultsPanel, updateInfoPanel, renderPreviewImages };
  })();

  /* ========================================================================
     10. PROCESSOR — orchestrates compressing the active (or all) items
     ==================================================================== */

  const Processor = (() => {
    /** Falls back to JPEG if the browser can't actually encode the requested mime. */
    const resolveSupportedMime = async (mime) => {
      if (mime === 'image/jpeg' || mime === 'image/png') return mime; // Universally supported.
      const supported = await CompressionEngine.detectEncodeSupport(mime);
      return supported ? mime : 'image/jpeg';
    };

    const processItem = async (item, settings) => {
      BatchList.setProgress(item.id, 20, true);

      const resolvedMime = await resolveSupportedMime(settings.mime);
      const dims = ControlsPanel.computeDimensions(item);
      const drawSettings = { ...settings, mime: resolvedMime };

      BatchList.setProgress(item.id, 50, true);

      let blob;
      let width = dims.width;
      let height = dims.height;

      if (settings.targetBytes) {
        const result = await CompressionEngine.compressToTargetSize(
          item.bitmap,
          dims.width,
          dims.height,
          drawSettings,
          settings.targetBytes
        );
        blob = result.blob;
        width = result.width;
        height = result.height;
      } else {
        const canvas = CompressionEngine.drawToCanvas(item.bitmap, dims.width, dims.height, drawSettings);
        blob =
          resolvedMime === 'image/png'
            ? await CompressionEngine.canvasToBlob(canvas, resolvedMime)
            : await CompressionEngine.canvasToBlob(canvas, resolvedMime, settings.quality);
      }

      BatchList.setProgress(item.id, 75, true);

      // Best-effort metadata handling — only meaningful for JPEG/PNG outputs.
      if (settings.dpi > 0) {
        if (resolvedMime === 'image/jpeg') blob = await CompressionEngine.writeJpegDpi(blob, settings.dpi);
        if (resolvedMime === 'image/png') blob = await CompressionEngine.writePngDpi(blob, settings.dpi);
      }
      if (settings.preserveMetadata && resolvedMime === 'image/jpeg' && item.exifSegment) {
        blob = await CompressionEngine.reinjectExif(blob, item.exifSegment);
      }

      if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
      item.compressedBlob = blob;
      item.compressedUrl = URL.createObjectURL(blob);
      item.compressedWidth = width;
      item.compressedHeight = height;
      item.outputMime = resolvedMime;

      BatchList.setProgress(item.id, 100, false);
      BatchList.updateMeta(item);
    };

    const processActive = async () => {
      const item = ImageStore.getActive();
      if (!item) return;
      const settings = ControlsPanel.getSettings();
      try {
        await processItem(item, settings);
        PreviewController.renderPreviewImages(item);
        PreviewController.updateResultsPanel(item);
        downloadBtn.disabled = false;
        copyBtn.disabled = false;
        downloadAllBtn.disabled = false;
      } catch (err) {
        BatchList.setProgress(item.id, 0, false);
        ErrorManager.show(`Couldn't compress "${item.file.name}" — your browser may not support this output format.`);
      }
    };

    const processAll = async () => {
      const settings = ControlsPanel.getSettings();
      for (const item of ImageStore.all()) {
        try {
          await processItem(item, settings);
        } catch (err) {
          ErrorManager.show(`Couldn't compress "${item.file.name}".`);
        }
      }
      const active = ImageStore.getActive();
      if (active) {
        PreviewController.renderPreviewImages(active);
        PreviewController.updateResultsPanel(active);
      }
      downloadAllBtn.disabled = ImageStore.all().every((i) => !i.compressedBlob);
    };

    return { processActive, processAll };
  })();

  /* ========================================================================
     11. ACTIONS — download, download all, copy to clipboard, rename
     ==================================================================== */

  const ActionsManager = (() => {
    const triggerDownload = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };

    const downloadItem = (id) => {
      const item = ImageStore.get(id);
      if (!item || !item.compressedBlob) return;
      const ext = extensionForMime(item.outputMime || item.mime);
      triggerDownload(item.compressedBlob, `${item.outputName || 'image'}.${ext}`);
    };

    const downloadActive = () => {
      const item = ImageStore.getActive();
      if (!item || !item.compressedBlob) return;
      const ext = extensionForMime(item.outputMime || item.mime);
      const name = renameInput.value.trim() || item.outputName || 'image';
      triggerDownload(item.compressedBlob, `${name}.${ext}`);
    };

    /** Downloads every compressed item sequentially (no zip library is used). */
    const downloadAll = () => {
      const compressedItems = ImageStore.all().filter((i) => i.compressedBlob);
      compressedItems.forEach((item, index) => {
        setTimeout(() => downloadItem(item.id), index * 350);
      });
    };

    const copyActiveToClipboard = async () => {
      const item = ImageStore.getActive();
      if (!item || !item.compressedBlob) return;

      if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
        ErrorManager.show('Copying images isn\u2019t supported in this browser — try downloading instead.');
        return;
      }

      try {
        // Most browsers only accept image/png on the clipboard, so re-encode if needed.
        let clipboardBlob = item.compressedBlob;
        if (clipboardBlob.type !== 'image/png') {
          const canvas = CompressionEngine.drawToCanvas(
            item.bitmap,
            item.compressedWidth,
            item.compressedHeight,
            { mime: 'image/png', preserveTransparency: true }
          );
          clipboardBlob = await CompressionEngine.canvasToBlob(canvas, 'image/png');
        }
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': clipboardBlob })]);
      } catch (err) {
        ErrorManager.show('Your browser blocked copying the image to the clipboard.');
      }
    };

    const init = () => {
      downloadBtn.addEventListener('click', downloadActive);
      downloadAllBtn.addEventListener('click', downloadAll);
      copyBtn.addEventListener('click', copyActiveToClipboard);
      renameInput.addEventListener('input', () => {
        const item = ImageStore.getActive();
        if (item) item.outputName = renameInput.value.trim() || item.outputName;
      });
    };

    return { init, downloadItem };
  })();

  /* ========================================================================
     12. BOOTSTRAP
     ==================================================================== */

  const init = () => {
    Uploader.init();
    BatchList.init();
    PreviewController.init();
    ActionsManager.init();
    ControlsPanel.init(() => {
      if (ImageStore.getActive()) Processor.processActive();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
