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
  box.innerHTML = '<div class="gmap-tiles"></div><div class="gmap-pin" hidden></div><div class="gmap-zoom"><button type="button" data-z="1">+</button><button type="button" data-z="-1">−</button></div><div class="gmap-credit">© OpenStreetMap</div>';
  const tiles = box.querySelector(".gmap-tiles"), pinEl = box.querySelector(".gmap-pin"), have = new Map();
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
    if (pin) { pinEl.hidden = false; pinEl.style.transform = `translate(${worldX(pin.lon, z) - x0}px, ${worldY(pin.lat, z) - y0}px)`; } else pinEl.hidden = true;
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
    drag = {x: ev.clientX, y: ev.clientY, cx, cy, moved: false, pin: !!ev.target.closest(".gmap-pin"), left: r.left, top: r.top};
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
    setPin(lat, lon, zoom) { pin = {lat, lon}; cx = worldX(lon, z); cy = worldY(lat, z); if (zoom && zoom !== z) { z = zoom; have.forEach((i) => i.remove()); have.clear(); cx = worldX(lon, z); cy = worldY(lat, z); } render(); },
    pin: () => pin,
    zoom: () => z,
    destroy() { have.clear(); box.innerHTML = ""; },
  };
}
