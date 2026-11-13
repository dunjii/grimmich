// A small map (OpenStreetMap tiles): move by dragging, zoom with the mouse wheel or the buttons, a pin you can place by clicking or dragging.
// No library: the tiles are loaded by the browser, so without internet the map stays empty (everything else keeps working).
const TILE = 256, MAXZ = 19, MINZ = 2;
export const worldX = (lon, z) => ((lon + 180) / 360) * 2 ** z * TILE;
export const worldY = (lat, z) => {
  const r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * TILE;
};
export const lonOf = (x, z) => (x / (2 ** z * TILE)) * 360 - 180;
export const latOf = (y, z) => { const n = Math.PI - 2 * Math.PI * (y / (2 ** z * TILE)); return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

// opts: {lat, lon, zoom, pin: {lat, lon} | null, onPick(lat, lon)}; returns {setPin, center, destroy, pin()}
export function createMap(box, opts) {
  let z = opts.zoom || 6, cx = worldX(opts.lon, z), cy = worldY(opts.lat, z), pin = opts.pin || null;
  box.classList.add("gmap");
  box.innerHTML = '<div class="gmap-tiles"></div><div class="gmap-marks"></div><div class="gmap-pin" hidden></div><div class="gmap-zoom"><button type="button" data-z="1">+</button><button type="button" data-z="-1">−</button></div><div class="gmap-credit">© OpenStreetMap</div>';
  const tiles = box.querySelector(".gmap-tiles"), pinEl = box.querySelector(".gmap-pin"), marksEl = box.querySelector(".gmap-marks"), have = new Map();
  let marks = [], clusterZ = null, clusters = [], markDone = null, pickable = opts.pickable !== false;
  const size = () => ({w: box.clientWidth || 600, h: box.clientHeight || 250});
  function render() {
    const {w, h} = size(), x0 = cx - w / 2, y0 = cy - h / 2, n = 2 ** z;
    const want = new Set();
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + w) / TILE); tx++) {
      for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + h) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n, id = `${z}/${wx}/${ty}/${tx}`;
        want.add(id);
        let img = have.get(id);
        if (!img) {
          img = document.createElement("img"); img.alt = ""; img.draggable = false; img.className = "gmap-tile";
          img.src = `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`;
          tiles.appendChild(img); have.set(id, img);
        }
        img.style.transform = `translate(${Math.round(tx * TILE - x0)}px, ${Math.round(ty * TILE - y0)}px)`;
      }
    }
    have.forEach((img, id) => { if (!want.has(id)) { img.remove(); have.delete(id); } });
    drawMarks(x0, y0, w, h);
    if (opts.onView) opts.onView({lat: latOf(cy, z), lon: lonOf(cx, z), zoom: z});
    if (pin) { pinEl.hidden = false; pinEl.style.transform = `translate(${worldX(pin.lon, z) - x0}px, ${worldY(pin.lat, z) - y0}px)`; } else pinEl.hidden = true;
  }
  // markers: [{id, lat, lon, n, sel, title}]; points that lie close together on the screen become one circle with the sum
  function makeClusters() {
    const list = marks.map((m) => ({m, x: worldX(m.lon, z), y: worldY(m.lat, z)})).sort((a, b) => (b.m.sel ? 1 : 0) - (a.m.sel ? 1 : 0) || b.m.n - a.m.n);
    const out = [];
    list.forEach((p) => {
      const c = out.find((o) => !o.m.sel && !p.m.sel && Math.hypot(o.x - p.x, o.y - p.y) < 34);
      if (c) { c.items.push(p.m); c.n += p.m.n; c.x = (c.x * (c.items.length - 1) + p.x) / c.items.length; c.y = (c.y * (c.items.length - 1) + p.y) / c.items.length; c.m = c.m; }
      else out.push({m: p.m, x: p.x, y: p.y, n: p.m.n, items: [p.m]});
    });
    clusters = out; clusterZ = z; marksEl.innerHTML = out.map((c, i) => {
      const one = c.items.length === 1, d = Math.round(Math.min(56, 26 + Math.log2(c.n + 1) * 5));
      return `<div class="gmap-mk${c.items.some((m) => m.sel) ? " sel" : ""}${one ? "" : " multi"}" data-i="${i}" style="width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px" title="${(one ? c.m.title || "" : c.items.length + " ×").replace(/"/g, "&quot;")}">${c.n}</div>`;
    }).join("");
  }
  function drawMarks(x0, y0, w, h) {
    if (clusterZ !== z) makeClusters();
    marksEl.childNodes.forEach((el, i) => {
      const c = clusters[i]; if (!c) return;
      const px = c.x - x0, py = c.y - y0;
      el.style.transform = `translate(${px}px, ${py}px)`; el.style.display = px < -60 || py < -60 || px > w + 60 || py > h + 60 ? "none" : "";
    });
  }
  const toLatLon = (px, py) => { const {w, h} = size(); return {lat: latOf(cy - h / 2 + py, z), lon: lonOf(cx - w / 2 + px, z)}; };
  function zoomTo(nz, px, py) {
    nz = Math.max(MINZ, Math.min(MAXZ, nz));
    if (nz === z) return;
    const {w, h} = size(), at = toLatLon(px ?? w / 2, py ?? h / 2);
    z = nz; have.forEach((img) => img.remove()); have.clear();
    cx = worldX(at.lon, z) - ((px ?? w / 2) - w / 2); cy = worldY(at.lat, z) - ((py ?? h / 2) - h / 2);
    render();
  }
  // drag the map, a click (hardly any movement) places the pin; the pin itself can be dragged
  let drag = null;
  box.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".gmap-zoom")) return;
    const r = box.getBoundingClientRect();
    drag = {mk: ev.target.closest(".gmap-mk"), x: ev.clientX, y: ev.clientY, cx, cy, moved: false, pin: !!ev.target.closest(".gmap-pin"), left: r.left, top: r.top};
    box.setPointerCapture(ev.pointerId);
  });
  box.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.pin) { pin = toLatLon(ev.clientX - drag.left, ev.clientY - drag.top); render(); return; }
    cx = drag.cx - dx; cy = drag.cy - dy; render();
  });
  box.addEventListener("pointerup", (ev) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.mk) {
      if (d.moved) return;
      const c = clusters[+d.mk.dataset.i];
      if (!c) return;
      if (c.items.length === 1) { if (markDone) markDone(c.m); }
      else zoomTo(Math.min(MAXZ, z + 2), c.x - (cx - size().w / 2), c.y - (cy - size().h / 2));
      return;
    }
    if (!pickable) return;
    if (d.pin) { if (d.moved && opts.onPick) opts.onPick(pin.lat, pin.lon); return; }
    if (!d.moved) { pin = toLatLon(ev.clientX - d.left, ev.clientY - d.top); render(); if (opts.onPick) opts.onPick(pin.lat, pin.lon); }
  });
  box.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const r = box.getBoundingClientRect();
    zoomTo(z + (ev.deltaY < 0 ? 1 : -1), ev.clientX - r.left, ev.clientY - r.top);
  }, {passive: false});
  box.querySelectorAll(".gmap-zoom button").forEach((b) => b.addEventListener("click", () => zoomTo(z + +b.dataset.z)));
  setTimeout(render, 0);
  return {
    setMarks(list, onClick) { marks = list; markDone = onClick; clusterZ = null; render(); },
    view: () => ({lat: latOf(cy, z), lon: lonOf(cx, z), zoom: z}),
    // show all points: the biggest zoom at which they all fit
    fit(points) {
      if (!points.length) return;
      const {w, h} = size();
      let nz = MAXZ;
      for (; nz > MINZ; nz--) {
        const xs = points.map((p) => worldX(p.lon, nz)), ys = points.map((p) => worldY(p.lat, nz));
        if (Math.max(...xs) - Math.min(...xs) < w - 80 && Math.max(...ys) - Math.min(...ys) < h - 80) break;
      }
      nz = Math.min(nz, 16);
      const xs = points.map((p) => worldX(p.lon, nz)), ys = points.map((p) => worldY(p.lat, nz));
      z = nz; have.forEach((i) => i.remove()); have.clear(); cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2; clusterZ = null; render();
    },
    centerOn(lat, lon, zoom) { if (zoom && zoom !== z) { z = zoom; have.forEach((i) => i.remove()); have.clear(); } cx = worldX(lon, z); cy = worldY(lat, z); clusterZ = null; render(); },
    setPin(lat, lon, zoom) { pin = {lat, lon}; cx = worldX(lon, z); cy = worldY(lat, z); if (zoom && zoom !== z) { z = zoom; have.forEach((i) => i.remove()); have.clear(); cx = worldX(lon, z); cy = worldY(lat, z); } render(); },
    pin: () => pin,
    zoom: () => z,
    destroy() { have.clear(); box.innerHTML = ""; },
  };
}
