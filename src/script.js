let canvas = null;
let adapter = null;
let device = null;
let context = null;
let format = null;
let pipeline = null;
let outputTexture = null;
let computePipeline = null;
let renderBindGroup = null;
let computeBindGroup = null;
let uniformBuffer = null;

const fallbackPlanetData = [
    {
        name: 'Sun',
        type: 'Star',
        orbitalDistance: 0.0,
        radius: 0.8,
        period: 0.0,
        color: '#FFE0B2',
        description: 'The central star of the system. It is the main light source and the body the corona is built around.',
    },
    {
        name: 'Mercury',
        type: 'Planet',
        orbitalDistance: 1.55,
        radius: 0.04,
        period: 0.241,
        color: '#8C8A82',
        description: 'Small, rocky, and closest to the Sun. It completes an orbit very quickly compared with the outer planets.',
    },
    {
        name: 'Venus',
        type: 'Planet',
        orbitalDistance: 2.89,
        radius: 0.07,
        period: 0.615,
        color: '#E6D28C',
        description: 'A bright rocky world with a thick atmosphere in the simulation view.',
    },
    {
        name: 'Earth',
        type: 'Planet',
        orbitalDistance: 4.0,
        radius: 0.08,
        period: 1.0,
        color: '#3380E6',
        description: 'Our home planet, shown with a slightly larger visible size for readability in the scene.',
    },
    {
        name: 'Mars',
        type: 'Planet',
        orbitalDistance: 6.1,
        radius: 0.05,
        period: 1.881,
        color: '#CC5926',
        description: 'A small red planet with a longer orbit than Earth and a much thinner appearance.',
    },
    {
        name: 'Jupiter',
        type: 'Planet',
        orbitalDistance: 20.8,
        radius: 0.45,
        period: 11.86,
        color: '#CCA666',
        description: 'The largest planet in the system, exaggerated here for visibility and scale contrast.',
    },
    {
        name: 'Saturn',
        type: 'Planet',
        orbitalDistance: 38.1,
        radius: 0.38,
        period: 29.46,
        color: '#D9BF8C',
        description: 'Known for its rings. In this simulation, the rings are rendered separately from the sphere.',
    },
    {
        name: 'Uranus',
        type: 'Planet',
        orbitalDistance: 76.8,
        radius: 0.18,
        period: 84.01,
        color: '#99D9E6',
        description: 'An icy giant with a pale blue tone and a very long orbital period.',
    },
    {
        name: 'Neptune',
        type: 'Planet',
        orbitalDistance: 120.3,
        radius: 0.17,
        period: 164.8,
        color: '#4066E6',
        description: 'A distant blue planet with the longest orbit in the scene.',
    },
];

let planetData = [...fallbackPlanetData];

const sliderState = {
    spp: 1,
    cameraPosX: 0.0,
    cameraPosY: 3.0,
    cameraPosZ: 12.0,
    cameraPitch: -0.2,
    cameraYaw: 0.0,
    timeSpeed: 0.5,
    moveSpeed: 15.0,
};

let simTime = 0;
let lastFrameTime = 0;
const keyState = {};
let selectedPlanetIndex = -1;
let hoveredPlanetIndex = -1;
let focusSelected = false;
let planetListEl = null;
let planetInfoEl = null;
let planetSearchEl = null;
let pauseToggleEl = null;
let focusToggleEl = null;
let simPaused = false;
let workspaceEl = null;
let tabSolarEl = null;
let tabLightEl = null;
let solarPanelEl = null;
let lightPanelEl = null;
let canvasContainerEl = null;
let lightLabContainerEl = null;
let lightCanvas = null;
let lightCtx = null;
let activeTab = 'solar';
let laserAngleEl = null;
let glassIorEl = null;
let glassRotationEl = null;
let lightModeEl = null;
let spectrumSamplesEl = null;
let spectrumSamplesWrapEl = null;
let branchModeEl = null;
let branchModeWrapEl = null;
let newShapeTypeEl = null;
let shapeListEl = null;
let addShapeEl = null;
let deleteShapeEl = null;
let resetLightLabEl = null;
let lightMode = 'full';
let lightSpectrumSamples = 80;
let branchMode = 'both';
let selectedShapeIndex = 0;
let nextShapeId = 1;
const MAX_LIGHT_SHAPES = 16;
const LIGHT_SSAA = 2;
const LIGHT_RAY_SSAA = LIGHT_SSAA;

const lightLabState = {
    width: 0,
    height: 0,
    dragMode: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    laser: {
        x: 140,
        y: 230,
        angleDeg: -18,
        handleDistance: 110,
    },
    shapes: [],
};

const GLASS_ABSORPTION = 0.004;
const SPECTRUM_MIN_NM = 380;
const SPECTRUM_MAX_NM = 780;
const BK7_C1 = 1.03961212;
const BK7_C2 = 0.231792344;
const BK7_C3 = 1.01046945;
const BK7_D1 = 0.00600069867;
const BK7_D2 = 0.0200179144;
const BK7_D3 = 103.560653;

function updateLabel(id, value) {
    const label = document.getElementById(id);
    if (label) {
        label.textContent = parseFloat(value).toFixed(2);
    }
}

function bindSlider(inputId, labelId, stateKey) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', () => {
        sliderState[stateKey] = parseFloat(input.value);
        updateLabel(labelId, input.value);
    });
    updateLabel(labelId, input.value);
}

function formatNumber(value, digits = 2) {
    return Number(value).toFixed(digits);
}

function parsePlanetCsv(csvText) {
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= 1) {
        return [];
    }

    const parseLine = (line) => {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i += 1) {
            const char = line[i];
            const next = line[i + 1];

            if (char === '"') {
                if (inQuotes && next === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        values.push(current);
        return values.map((value) => value.trim());
    };

    const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
    return lines.slice(1).map((line) => {
        const values = parseLine(line);
        const entry = {};
        headers.forEach((header, index) => {
            entry[header] = values[index] ?? '';
        });
        return {
            name: entry.name,
            type: entry.type,
            orbitalDistance: parseFloat(entry.orbitaldistance),
            radius: parseFloat(entry.radius),
            period: parseFloat(entry.period),
            color: entry.color,
            description: entry.description,
        };
    }).filter((planet) => planet.name && Number.isFinite(planet.orbitalDistance) && Number.isFinite(planet.radius) && Number.isFinite(planet.period));
}

async function loadPlanetData() {
    try {
        const response = await fetch('../data/planetInfo.csv');
        if (!response.ok) {
            throw new Error(`Failed to load planetInfo.csv: ${response.status}`);
        }
        const parsed = parsePlanetCsv(await response.text());
        if (parsed.length > 0) {
            planetData = parsed;
            return;
        }
    } catch (err) {
        console.warn('Falling back to built-in planet data.', err);
    }

    planetData = [...fallbackPlanetData];
}

function planetPosition(planet, time) {
    if (planet.period <= 0) {
        return { x: 0.0, y: 0.0, z: 0.0 };
    }
    const angle = 2 * Math.PI * time / planet.period;
    return {
        x: planet.orbitalDistance * Math.cos(angle),
        y: 0.0,
        z: planet.orbitalDistance * Math.sin(angle),
    };
}

function getPlanetPositions(time) {
    return planetData.map((planet) => planetPosition(planet, time));
}

function updatePlanetInfo() {
    if (!planetInfoEl) return;
    if (selectedPlanetIndex < 0) {
        planetInfoEl.innerHTML = '<div class="planet-info-empty">Search or click a planet to inspect it.</div>';
        return;
    }
    const planet = planetData[selectedPlanetIndex];
    const pos = planetPosition(planet, simTime);
    planetInfoEl.innerHTML = `
        <div class="name">${planet.name}</div>
        <div class="meta">${planet.type}</div>
        <div class="meta">Orbital distance: ${formatNumber(planet.orbitalDistance, 2)} AU units</div>
        <div class="meta">Visible radius: ${formatNumber(planet.radius, 2)}</div>
        <div class="meta">Orbital period: ${planet.period === 0 ? 'N/A' : `${formatNumber(planet.period, 3)} years`}</div>
        <div class="meta">Current position: x ${formatNumber(pos.x, 2)}, y ${formatNumber(pos.y, 2)}, z ${formatNumber(pos.z, 2)}</div>
        <div class="meta" style="margin-top:8px">${planet.description}</div>
    `;
}

function updatePlanetList(filterText = '') {
    if (!planetListEl) return;
    const query = filterText.trim().toLowerCase();
    planetListEl.innerHTML = '';

    planetData.forEach((planet, index) => {
        if (query && !planet.name.toLowerCase().includes(query)) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = index === selectedPlanetIndex ? 'active' : '';
        if (index === hoveredPlanetIndex) {
            button.classList.add('hovered');
        }
        button.innerHTML = `
            <span style="color:${planet.color};font-weight:700">${planet.name}</span>
            <small>${planet.type} &middot; ${planet.period === 0 ? 'stationary' : `${formatNumber(planet.period, 3)} yr orbit`}</small>
        `;
        button.addEventListener('click', () => {
            selectedPlanetIndex = index;
            updatePlanetInfo();
            updatePlanetList(planetSearchEl ? planetSearchEl.value : '');
        });
        planetListEl.appendChild(button);
    });
}

function setSelectedPlanet(index) {
    if (index < 0 || index >= planetData.length) {
        return;
    }
    selectedPlanetIndex = index;
    if (planetSearchEl) {
        planetSearchEl.value = planetData[index].name;
    }
    updatePlanetInfo();
    updatePlanetList(planetSearchEl ? planetSearchEl.value : '');
}

function setHoveredPlanet(index) {
    if (hoveredPlanetIndex === index) {
        return;
    }
    hoveredPlanetIndex = index;
    updatePlanetList(planetSearchEl ? planetSearchEl.value : '');
}

function resolvePlanetFromQuery(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return -1;

    const exact = planetData.findIndex((planet) => planet.name.toLowerCase() === normalized);
    if (exact !== -1) return exact;

    return planetData.findIndex((planet) => planet.name.toLowerCase().includes(normalized));
}

function updateFocusToggle() {
    if (!focusToggleEl) return;
    focusToggleEl.textContent = `Focus selected: ${focusSelected ? 'On' : 'Off'}`;
    focusToggleEl.classList.toggle('active', focusSelected);
}

function updatePauseToggle() {
    if (!pauseToggleEl) return;
    pauseToggleEl.textContent = `Pause sim: ${simPaused ? 'On' : 'Off'}`;
    pauseToggleEl.classList.toggle('active', simPaused);
}

function updateLightLabLabels() {
    updateLabel('laserAngleValue', lightLabState.laser.angleDeg);
    const spectrumSamplesLabel = document.getElementById('spectrumSamplesValue');
    if (spectrumSamplesLabel) {
        spectrumSamplesLabel.textContent = String(lightSpectrumSamples);
    }
    const selectedShape = getSelectedShape();
    if (selectedShape) {
        updateLabel('glassIorValue', selectedShape.ior);
        updateLabel('glassRotationValue', selectedShape.rotationDeg);
        if (glassIorEl) glassIorEl.disabled = false;
        if (glassRotationEl) glassRotationEl.disabled = false;
        if (deleteShapeEl) deleteShapeEl.disabled = false;
    } else {
        const iorLabel = document.getElementById('glassIorValue');
        const rotationLabel = document.getElementById('glassRotationValue');
        if (iorLabel) iorLabel.textContent = '--';
        if (rotationLabel) rotationLabel.textContent = '--';
        if (glassIorEl) glassIorEl.disabled = true;
        if (glassRotationEl) glassRotationEl.disabled = true;
        if (deleteShapeEl) deleteShapeEl.disabled = true;
    }
    if (lightModeEl) {
        lightModeEl.value = lightMode;
    }
    if (spectrumSamplesEl) {
        spectrumSamplesEl.value = String(lightSpectrumSamples);
    }
    if (branchModeEl) {
        branchModeEl.value = branchMode;
    }
    if (selectedShape) {
        if (glassIorEl) glassIorEl.value = selectedShape.ior;
        if (glassRotationEl) glassRotationEl.value = selectedShape.rotationDeg;
    }
    updateShapeList();
}

function getFullSpectrumSamples() {
    const count = Math.max(1, Math.floor(lightSpectrumSamples));
    const samples = [];
    for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const wavelengthNm = SPECTRUM_MIN_NM + (SPECTRUM_MAX_NM - SPECTRUM_MIN_NM) * t;
        samples.push({ wavelengthNm, color: wavelengthToRgb(wavelengthNm) });
    }
    return samples;
}

function updateShapeList() {
    if (!shapeListEl) {
        return;
    }
    shapeListEl.innerHTML = '';
    if (!lightLabState.shapes.length) {
        const empty = document.createElement('div');
        empty.className = 'planet-info-empty';
        empty.textContent = 'No shapes yet. Add one to start tracing.';
        shapeListEl.appendChild(empty);
        return;
    }
    lightLabState.shapes.forEach((shape, index) => {
        const button = document.createElement('button');
        button.className = index === selectedShapeIndex ? 'active' : '';
        button.innerHTML = `
            ${shape.type === 'slab' ? 'Glass Slab' : shape.type === 'circle' ? 'Glass Circle' : 'Glass Prism'}
            <small>${shape.type} &middot; n=${formatNumber(shape.ior, 2)}</small>
        `;
        button.addEventListener('click', () => {
            selectedShapeIndex = index;
            updateLightLabLabels();
        });
        shapeListEl.appendChild(button);
    });
}

function getCanvasPixelFromClient(targetCanvas, clientX, clientY) {
    if (!targetCanvas) {
        return null;
    }

    const rect = targetCanvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
    }

    // Match the compute shader's integer invocation coordinates exactly:
    // each screen position maps to the containing output pixel.
    const x = ((clientX - rect.left) / rect.width) * targetCanvas.width;
    const y = ((clientY - rect.top) / rect.height) * targetCanvas.height;
    return {
        pixelX: Math.max(0, Math.min(targetCanvas.width - 1, Math.floor(x))),
        pixelY: Math.max(0, Math.min(targetCanvas.height - 1, targetCanvas.height - 1 - Math.floor(y))),
    };
}

function getRayFromPixel(targetCanvas, pixelX, pixelY, sampleSeed = null) {
    const dimsY = targetCanvas.height;
    const uvX = (pixelX - 0.5 * targetCanvas.width) / dimsY;
    const uvY = (pixelY - 0.5 * targetCanvas.height) / dimsY;

    let rx = 0;
    let ry = 0;
    if (sampleSeed !== null) {
        rx = (randFloat(sampleSeed) - 0.5) * 0.001;
        ry = (randFloat(sampleSeed + 7) - 0.5) * 0.001;
    }

    const pitch = sliderState.cameraPitch;
    const yaw = sliderState.cameraYaw;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    const camX = uvX + rx;
    const camY = uvY + ry;
    const camZ = -1.0;

    const y1 = camY * cp - camZ * sp;
    const z1 = camY * sp + camZ * cp;
    const x2 = camX * cy - z1 * sy;
    const z2 = camX * sy + z1 * cy;
    return {
        origin: {
            x: sliderState.cameraPosX,
            y: sliderState.cameraPosY,
            z: sliderState.cameraPosZ,
        },
        direction: normalizeVec3({ x: x2, y: y1, z: z2 }),
    };
}

function getCameraRayFromCanvas(targetCanvas, clientX, clientY, sampleSeed = null) {
    const pixel = getCanvasPixelFromClient(targetCanvas, clientX, clientY);
    if (!pixel) {
        return null;
    }
    return getRayFromPixel(targetCanvas, pixel.pixelX, pixel.pixelY, sampleSeed);
}

function normalizeVec3(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function normalizeVec2(v) {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
}

function rotateVec2(v, angleRad) {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return {
        x: v.x * c - v.y * s,
        y: v.x * s + v.y * c,
    };
}

function addVec2(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}

function subVec2(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}

function mulVec2(v, s) {
    return { x: v.x * s, y: v.y * s };
}

function dotVec2(a, b) {
    return a.x * b.x + a.y * b.y;
}

function crossVec2(a, b) {
    return a.x * b.y - a.y * b.x;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function wavelengthToRgb(wavelengthNm) {
    const w = wavelengthNm;
    let r = 0;
    let g = 0;
    let b = 0;

    if (w >= 380 && w < 440) {
        r = -(w - 440) / (440 - 380);
        g = 0;
        b = 1;
    } else if (w < 490) {
        r = 0;
        g = (w - 440) / (490 - 440);
        b = 1;
    } else if (w < 510) {
        r = 0;
        g = 1;
        b = -(w - 510) / (510 - 490);
    } else if (w < 580) {
        r = (w - 510) / (580 - 510);
        g = 1;
        b = 0;
    } else if (w < 645) {
        r = 1;
        g = -(w - 645) / (645 - 580);
        b = 0;
    } else if (w <= 780) {
        r = 1;
        g = 0;
        b = 0;
    }

    let factor = 0;
    if (w >= 380 && w < 420) {
        factor = 0.3 + 0.7 * (w - 380) / (420 - 380);
    } else if (w < 701) {
        factor = 1;
    } else if (w <= 780) {
        factor = 0.3 + 0.7 * (780 - w) / (780 - 700);
    }

    const gamma = 0.8;
    const adjust = (c) => (c <= 0 ? 0 : Math.pow(c * factor, gamma));
    return {
        r: adjust(r),
        g: adjust(g),
        b: adjust(b),
    };
}

function getLaserDirection() {
    const radians = lightLabState.laser.angleDeg * Math.PI / 180;
    return normalizeVec2({
        x: Math.cos(radians),
        y: Math.sin(radians),
    });
}

function setLaserAngleFromDirection(direction) {
    lightLabState.laser.angleDeg = Math.atan2(direction.y, direction.x) * 180 / Math.PI;
    if (laserAngleEl) {
        laserAngleEl.value = lightLabState.laser.angleDeg.toFixed(1);
    }
    updateLightLabLabels();
}

function getLaserHandlePosition() {
    const direction = getLaserDirection();
    return {
        x: lightLabState.laser.x + direction.x * lightLabState.laser.handleDistance,
        y: lightLabState.laser.y + direction.y * lightLabState.laser.handleDistance,
    };
}

function createLightShape(type, x, y, scale = 1) {
    const id = `shape-${nextShapeId++}`;
    if (type === 'circle') {
        return {
            id,
            type,
            x,
            y,
            radius: 76 * scale,
            rotationDeg: 0,
            ior: 1.46,
            absorption: GLASS_ABSORPTION,
        };
    }
    if (type === 'prism') {
        return {
            id,
            type,
            x,
            y,
            width: 180 * scale,
            height: 150 * scale,
            rotationDeg: -18,
            ior: 1.53,
            absorption: GLASS_ABSORPTION,
        };
    }
    return {
        id,
        type: 'slab',
        x,
        y,
        width: 200 * scale,
        height: 130 * scale,
        rotationDeg: 12,
        ior: 1.5,
        absorption: GLASS_ABSORPTION,
    };
}

function getSelectedShape() {
    if (!lightLabState.shapes.length) {
        return null;
    }
    const index = Math.max(0, Math.min(lightLabState.shapes.length - 1, selectedShapeIndex));
    return lightLabState.shapes[index] ?? null;
}

function setSelectedShapeIndex(index) {
    if (!lightLabState.shapes.length) {
        selectedShapeIndex = -1;
        updateShapeList();
        updateLightLabLabels();
        return;
    }
    selectedShapeIndex = clamp(index, 0, lightLabState.shapes.length - 1);
    updateShapeList();
    updateLightLabLabels();
}

function getShapeFrame(shape) {
    return {
        center: { x: shape.x, y: shape.y },
        angle: shape.rotationDeg * Math.PI / 180,
        halfWidth: (shape.width ?? shape.radius * 2) * 0.5,
        halfHeight: (shape.height ?? shape.radius * 2) * 0.5,
    };
}

function worldToShapeLocalPoint(point, frame) {
    return rotateVec2(subVec2(point, frame.center), -frame.angle);
}

function worldToShapeLocalVector(vector, frame) {
    return rotateVec2(vector, -frame.angle);
}

function shapeLocalToWorldVector(vector, frame) {
    return rotateVec2(vector, frame.angle);
}

function getShapeLocalVertices(shape) {
    if (shape.type === 'prism') {
        const halfWidth = shape.width * 0.5;
        const halfHeight = shape.height * 0.5;
        return [
            { x: -halfWidth, y: halfHeight },
            { x: 0, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
        ];
    }
    const halfWidth = shape.width * 0.5;
    const halfHeight = shape.height * 0.5;
    return [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
    ];
}

function pointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
        const xi = vertices[i].x;
        const yi = vertices[i].y;
        const xj = vertices[j].x;
        const yj = vertices[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-12) + xi);
        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
}

function shapeContainsPoint(point, shape) {
    if (shape.type === 'circle') {
        const dx = point.x - shape.x;
        const dy = point.y - shape.y;
        return dx * dx + dy * dy <= shape.radius * shape.radius;
    }
    const frame = getShapeFrame(shape);
    const local = worldToShapeLocalPoint(point, frame);
    return pointInPolygon(local, getShapeLocalVertices(shape));
}

function getShapeOutline(shape) {
    if (shape.type === 'circle') {
        const points = [];
        const segments = 32;
        for (let i = 0; i < segments; i += 1) {
            const angle = (Math.PI * 2 * i) / segments;
            points.push({
                x: shape.x + Math.cos(angle) * shape.radius,
                y: shape.y + Math.sin(angle) * shape.radius,
            });
        }
        return points;
    }
    const frame = getShapeFrame(shape);
    return getShapeLocalVertices(shape).map((point) => addVec2(shapeLocalToWorldVector(point, frame), frame.center));
}

function getShapeEdges(shape) {
    const outline = getShapeOutline(shape);
    return outline.map((start, index) => ({
        start,
        end: outline[(index + 1) % outline.length],
    }));
}

function pointSegmentDistance(point, start, end) {
    const segment = subVec2(end, start);
    const denom = dotVec2(segment, segment) || 1;
    const t = clamp(dotVec2(subVec2(point, start), segment) / denom, 0, 1);
    const projection = addVec2(start, mulVec2(segment, t));
    return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function getOutwardNormal(start, end, vertices) {
    const edge = subVec2(end, start);
    const candidate = normalizeVec2({ x: edge.y, y: -edge.x });
    const midpoint = mulVec2(addVec2(start, end), 0.5);
    const probe = addVec2(midpoint, mulVec2(candidate, 2));
    return pointInPolygon(probe, vertices) ? mulVec2(candidate, -1) : candidate;
}

function intersectRaySegment(origin, direction, start, end) {
    const segment = subVec2(end, start);
    const denom = crossVec2(direction, segment);
    if (Math.abs(denom) < 1e-6) {
        return null;
    }
    const diff = subVec2(start, origin);
    const t = crossVec2(diff, segment) / denom;
    const u = crossVec2(diff, direction) / denom;
    if (t <= 1e-4 || u < 0 || u > 1) {
        return null;
    }
    return {
        t,
        point: addVec2(origin, mulVec2(direction, t)),
    };
}

function intersectRayShape(origin, direction, shape) {
    if (shape.type === 'circle') {
        const oc = subVec2(origin, { x: shape.x, y: shape.y });
        const a = dotVec2(direction, direction);
        const b = 2 * dotVec2(oc, direction);
        const c = dotVec2(oc, oc) - shape.radius * shape.radius;
        const disc = b * b - 4 * a * c;
        if (disc < 0) {
            return null;
        }
        const sqrtDisc = Math.sqrt(disc);
        const t0 = (-b - sqrtDisc) / (2 * a);
        const t1 = (-b + sqrtDisc) / (2 * a);
        const inside = c <= 0;
        const tHit = inside ? Math.max(t0, t1) : Math.min(t0, t1);
        if (!Number.isFinite(tHit) || tHit <= 1e-4) {
            return null;
        }
        const hitPoint = addVec2(origin, mulVec2(direction, tHit));
        const normal = normalizeVec2(subVec2(hitPoint, { x: shape.x, y: shape.y }));
        return {
            point: hitPoint,
            t: tHit,
            normal,
            inside,
            shape,
        };
    }

    const frame = getShapeFrame(shape);
    const localOrigin = worldToShapeLocalPoint(origin, frame);
    const localDirection = worldToShapeLocalVector(direction, frame);
    const vertices = getShapeLocalVertices(shape);
    const inside = pointInPolygon(localOrigin, vertices);
    let bestHit = null;

    for (let i = 0; i < vertices.length; i += 1) {
        const start = vertices[i];
        const end = vertices[(i + 1) % vertices.length];
        const hit = intersectRaySegment(localOrigin, localDirection, start, end);
        if (!hit) {
            continue;
        }
        if (!bestHit || hit.t < bestHit.t) {
            const edge = subVec2(end, start);
            const candidate = normalizeVec2({ x: edge.y, y: -edge.x });
            const midpoint = mulVec2(addVec2(start, end), 0.5);
            const probe = addVec2(midpoint, mulVec2(candidate, 1e-3));
            const localNormal = pointInPolygon(probe, vertices) ? mulVec2(candidate, -1) : candidate;
            bestHit = {
                point: addVec2(origin, mulVec2(direction, hit.t)),
                t: hit.t,
                normal: normalizeVec2(shapeLocalToWorldVector(localNormal, frame)),
                inside,
                shape,
            };
        }
    }

    return bestHit;
}

function intersectRayScene(origin, direction) {
    let best = null;
    for (const shape of lightLabState.shapes) {
        const hit = intersectRayShape(origin, direction, shape);
        if (!hit) {
            continue;
        }
        if (!best || hit.t < best.t) {
            best = hit;
        }
    }
    return best;
}

function intersectRayCanvas(origin, direction) {
    const candidates = [];
    const width = lightLabState.width;
    const height = lightLabState.height;
    if (Math.abs(direction.x) > 1e-6) {
        const tx0 = (0 - origin.x) / direction.x;
        const tx1 = (width - origin.x) / direction.x;
        candidates.push(tx0, tx1);
    }
    if (Math.abs(direction.y) > 1e-6) {
        const ty0 = (0 - origin.y) / direction.y;
        const ty1 = (height - origin.y) / direction.y;
        candidates.push(ty0, ty1);
    }
    let bestT = Infinity;
    for (const t of candidates) {
        if (t <= 1e-4 || t >= bestT) {
            continue;
        }
        const point = addVec2(origin, mulVec2(direction, t));
        if (point.x >= -1 && point.x <= width + 1 && point.y >= -1 && point.y <= height + 1) {
            bestT = t;
        }
    }
    if (!Number.isFinite(bestT)) {
        return addVec2(origin, mulVec2(direction, 2000));
    }
    return addVec2(origin, mulVec2(direction, bestT));
}

function reflectVec2(direction, normal) {
    const scale = 2 * dotVec2(direction, normal);
    return normalizeVec2(subVec2(direction, mulVec2(normal, scale)));
}

function refractVec2(direction, normal, n1, n2) {
    const i = normalizeVec2(direction);
    let n = normalizeVec2(normal);
    let cosi = clamp(dotVec2(i, n), -1, 1);
    let etai = n1;
    let etat = n2;
    if (cosi > 0) {
        n = mulVec2(n, -1);
        [etai, etat] = [etat, etai];
    } else {
        cosi = -cosi;
    }
    const eta = etai / etat;
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) {
        return null;
    }
    return normalizeVec2(addVec2(mulVec2(i, eta), mulVec2(n, eta * cosi - Math.sqrt(k))));
}

function fresnelReflectance(direction, normal, n1, n2) {
    const i = normalizeVec2(direction);
    let n = normalizeVec2(normal);
    let cosi = clamp(dotVec2(i, n), -1, 1);
    let etai = n1;
    let etat = n2;
    if (cosi > 0) {
        n = mulVec2(n, -1);
        [etai, etat] = [etat, etai];
    } else {
        cosi = -cosi;
    }
    const eta = etai / etat;
    const sint = eta * Math.sqrt(Math.max(0, 1 - cosi * cosi));
    if (sint >= 1) {
        return 1;
    }
    const cost = Math.sqrt(Math.max(0, 1 - sint * sint));
    cosi = Math.abs(cosi);
    const rs = ((etai * cosi) - (etat * cost)) / ((etai * cosi) + (etat * cost));
    const rp = ((etai * cost) - (etat * cosi)) / ((etai * cost) + (etat * cosi));
    return (rs * rs + rp * rp) * 0.5;
}

function sellmeierBk7Index(wavelengthNm) {
    const lambda = wavelengthNm / 1000;
    const lambda2 = lambda * lambda;
    const n2 = 1
        + (BK7_C1 * lambda2) / (lambda2 - BK7_D1)
        + (BK7_C2 * lambda2) / (lambda2 - BK7_D2)
        + (BK7_C3 * lambda2) / (lambda2 - BK7_D3);
    return Math.sqrt(n2);
}

function glassIndexForWavelength(wavelengthNm, baseIor = 1.5) {
    const reference = sellmeierBk7Index(550);
    const wavelengthShift = sellmeierBk7Index(wavelengthNm) - reference;
    return Math.max(1.0001, baseIor + wavelengthShift);
}

function fresnelPowerCoefficients(direction, normal, n1, n2) {
    const i = normalizeVec2(direction);
    let n = normalizeVec2(normal);
    let cosi = clamp(-dotVec2(i, n), -1, 1);
    let etai = n1;
    let etat = n2;
    if (cosi < 0) {
        cosi = -cosi;
        n = mulVec2(n, -1);
        [etai, etat] = [etat, etai];
    }
    const eta = etai / etat;
    const sin2t = eta * eta * Math.max(0, 1 - cosi * cosi);
    if (sin2t > 1) {
        return {
            totalInternalReflection: true,
            rs: 1,
            rp: 1,
            ts: 0,
            tp: 0,
            cosi,
            cost: 0,
        };
    }
    const cost = Math.sqrt(Math.max(0, 1 - sin2t));
    const rs = ((etai * cosi) - (etat * cost)) / ((etai * cosi) + (etat * cost));
    const rp = ((etai * cost) - (etat * cosi)) / ((etai * cost) + (etat * cosi));
    const ts = (4 * etai * etat * cosi * cost) / Math.pow((etai * cosi) + (etat * cost), 2);
    const tp = (4 * etai * etat * cosi * cost) / Math.pow((etai * cost) + (etat * cosi), 2);
    return {
        totalInternalReflection: false,
        rs: Math.max(0, rs * rs),
        rp: Math.max(0, rp * rp),
        ts: Math.max(0, ts),
        tp: Math.max(0, tp),
        cosi,
        cost,
    };
}

function mixedFresnelReflectance(direction, normal, n1, n2) {
    const f = fresnelPowerCoefficients(direction, normal, n1, n2);
    if (f.totalInternalReflection) {
        return 1;
    }
    return 0.5 * (f.rs + f.rp);
}

function shouldTraceBranch(branch, branchIntensity, branchLimit) {
    if (branchLimit === 'both') {
        return branchIntensity > 0.01;
    }
    return branch === branchLimit && branchIntensity > 0.01;
}

function traceLightRay(origin, direction, currentIor, depth, intensity, segments, normals, options) {
    const mode = options.mode;
    const wavelengthNm = options.wavelengthNm;
    const branchLimit = options.branchLimit;
    const sourceColor = options.sourceColor;
    const spectralBoost = options.spectralBoost ?? 1;
    const maxDepth = mode === 'full' ? 10 : mode === 'path' ? 12 : 8;

    if (depth > maxDepth || intensity < 0.01) {
        const end = intersectRayCanvas(origin, direction);
        segments.push({
            start: origin,
            end,
            color: `rgba(${Math.round(sourceColor.r * 255)}, ${Math.round(sourceColor.g * 255)}, ${Math.round(sourceColor.b * 255)}, ${Math.min(0.22, 0.18 * intensity * spectralBoost)})`,
            width: 1.2,
        });
        return;
    }

    const hit = intersectRayScene(origin, direction);
    if (!hit) {
        const end = intersectRayCanvas(origin, direction);
        const alpha = Math.min(1, Math.max(0, intensity * spectralBoost));
        segments.push({
            start: origin,
            end,
            color: mode === 'white'
                ? `rgba(245, 245, 255, ${0.95 * alpha})`
                : `rgba(${Math.round(sourceColor.r * 255)}, ${Math.round(sourceColor.g * 255)}, ${Math.round(sourceColor.b * 255)}, ${0.95 * alpha})`,
            width: mode === 'white' ? 2.9 : 2.4,
        });
        return;
    }

    const shape = hit.shape;
    const entering = !hit.inside;
    const nextIor = entering ? glassIndexForWavelength(wavelengthNm, shape.ior) : 1.0;
    const faceNormal = entering ? hit.normal : mulVec2(hit.normal, -1);
    const absorption = shape.absorption ?? GLASS_ABSORPTION;
    const arrivalIntensity = hit.inside ? intensity * Math.exp(-absorption * hit.t) : intensity;
    const coeffs = fresnelPowerCoefficients(direction, faceNormal, currentIor, nextIor);
    const reflectance = 0.5 * (coeffs.rs + coeffs.rp);
    const transmittance = coeffs.totalInternalReflection ? 0 : 0.5 * (coeffs.ts + coeffs.tp);

    if (mode !== 'path') {
        normals.push({ point: hit.point, normal: faceNormal });
    }
    segments.push({
        start: origin,
        end: hit.point,
        color: mode === 'white' || mode === 'path'
            ? `rgba(255, 248, 220, ${0.98 * arrivalIntensity})`
            : `rgba(${Math.round(sourceColor.r * 255)}, ${Math.round(sourceColor.g * 255)}, ${Math.round(sourceColor.b * 255)}, ${0.96 * arrivalIntensity})`,
        width: mode === 'path' ? 2.8 : entering ? 2.8 : 2.2,
    });

    const reflected = reflectVec2(direction, faceNormal);
    const refracted = coeffs.totalInternalReflection ? null : refractVec2(direction, faceNormal, currentIor, nextIor);

    if (mode === 'path') {
        if (refracted) {
            traceLightRay(
                addVec2(hit.point, mulVec2(refracted, 0.8)),
                refracted,
                nextIor,
                depth + 1,
                arrivalIntensity * (coeffs.totalInternalReflection ? 1 : transmittance),
                segments,
                normals,
                options
            );
        } else {
            traceLightRay(
                addVec2(hit.point, mulVec2(reflected, 0.8)),
                reflected,
                currentIor,
                depth + 1,
                arrivalIntensity * reflectance,
                segments,
                normals,
                options
            );
        }
        return;
    }

    const showReflection = mode !== 'white' && shouldTraceBranch('reflection', intensity * reflectance, branchLimit);
    const showRefraction = mode !== 'white' ? shouldTraceBranch('refraction', intensity * transmittance, branchLimit) : true;

    if (showReflection) {
        traceLightRay(
            addVec2(hit.point, mulVec2(reflected, 0.8)),
            reflected,
            currentIor,
            depth + 1,
            arrivalIntensity * reflectance,
            segments,
            normals,
            options
        );
    }

    if (refracted && showRefraction) {
        const nextOptions = { ...options };
        if (mode === 'white') {
            nextOptions.mode = 'white';
        }
        traceLightRay(
            addVec2(hit.point, mulVec2(refracted, 0.8)),
            refracted,
            nextIor,
            depth + 1,
            arrivalIntensity * (coeffs.totalInternalReflection ? 1 : transmittance),
            segments,
            normals,
            nextOptions
        );
    }
}

function createDefaultLightShapes(width, height) {
    return [
        createLightShape('slab', width * 0.60, height * 0.50, 1),
        createLightShape('circle', width * 0.42, height * 0.36, 1),
        createLightShape('prism', width * 0.72, height * 0.32, 1),
    ];
}

function syncSelectedShapeControls() {
    const shape = getSelectedShape();
    if (!shape) {
        return;
    }
    if (glassIorEl) {
        glassIorEl.value = shape.ior;
    }
    if (glassRotationEl) {
        glassRotationEl.value = shape.rotationDeg;
    }
    updateLightLabLabels();
}

function drawLightShape(shape, isSelected) {
    const outline = getShapeOutline(shape);
    if (!outline.length) {
        return;
    }
    lightCtx.save();
    lightCtx.beginPath();
    lightCtx.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i += 1) {
        lightCtx.lineTo(outline[i].x, outline[i].y);
    }
    lightCtx.closePath();

    let fill;
    if (shape.type === 'circle') {
        fill = lightCtx.createRadialGradient(shape.x - shape.radius * 0.25, shape.y - shape.radius * 0.25, 10, shape.x, shape.y, shape.radius);
        fill.addColorStop(0, 'rgba(152, 235, 255, 0.24)');
        fill.addColorStop(1, 'rgba(90, 168, 255, 0.10)');
    } else if (shape.type === 'prism') {
        fill = lightCtx.createLinearGradient(outline[0].x, outline[0].y, outline[2].x, outline[2].y);
        fill.addColorStop(0, 'rgba(160, 236, 255, 0.24)');
        fill.addColorStop(1, 'rgba(118, 180, 255, 0.10)');
    } else {
        fill = lightCtx.createLinearGradient(outline[0].x, outline[0].y, outline[2].x, outline[2].y);
        fill.addColorStop(0, 'rgba(146, 227, 255, 0.20)');
        fill.addColorStop(1, 'rgba(102, 183, 255, 0.10)');
    }

    lightCtx.fillStyle = fill;
    lightCtx.fill();
    lightCtx.strokeStyle = isSelected ? 'rgba(255, 223, 142, 0.9)' : 'rgba(176, 234, 255, 0.55)';
    lightCtx.lineWidth = isSelected ? 3 : 2;
    lightCtx.stroke();
    lightCtx.restore();
}

function addLightShape(type) {
    if (lightLabState.shapes.length >= MAX_LIGHT_SHAPES) {
        return;
    }
    const shape = createLightShape(type, lightLabState.width * 0.5, lightLabState.height * 0.5, 1);
    if (type === 'circle') {
        shape.x = lightLabState.width * 0.36;
        shape.y = lightLabState.height * 0.58;
    } else if (type === 'prism') {
        shape.x = lightLabState.width * 0.68;
        shape.y = lightLabState.height * 0.42;
    } else {
        shape.x = lightLabState.width * 0.58;
        shape.y = lightLabState.height * 0.50;
    }
    lightLabState.shapes.push(shape);
    setSelectedShapeIndex(lightLabState.shapes.length - 1);
    syncSelectedShapeControls();
}

function deleteSelectedShape() {
    if (!lightLabState.shapes.length || selectedShapeIndex < 0) {
        return;
    }
    lightLabState.shapes.splice(selectedShapeIndex, 1);
    if (!lightLabState.shapes.length) {
        selectedShapeIndex = -1;
        updateShapeList();
        updateLightLabLabels();
        return;
    }
    selectedShapeIndex = clamp(selectedShapeIndex, 0, lightLabState.shapes.length - 1);
    syncSelectedShapeControls();
}

function selectShapeAtPoint(point) {
    for (let i = lightLabState.shapes.length - 1; i >= 0; i -= 1) {
        if (shapeContainsPoint(point, lightLabState.shapes[i])) {
            setSelectedShapeIndex(i);
            return lightLabState.shapes[i];
        }
    }
    return null;
}

function resizeLightCanvas() {
    if (!lightCanvas || !workspaceEl) {
        return;
    }

    const newWidth = Math.max(1, Math.floor(workspaceEl.clientWidth));
    const newHeight = Math.max(1, Math.floor(workspaceEl.clientHeight));
    const oldWidth = lightLabState.width || newWidth;
    const oldHeight = lightLabState.height || newHeight;
    const sx = newWidth / oldWidth;
    const sy = newHeight / oldHeight;

    lightCanvas.width = newWidth;
    lightCanvas.height = newHeight;
    lightLabState.width = newWidth;
    lightLabState.height = newHeight;

    if (oldWidth !== newWidth || oldHeight !== newHeight) {
        lightLabState.laser.x *= sx;
        lightLabState.laser.y *= sy;
        lightLabState.shapes.forEach((shape) => {
            shape.x *= sx;
            shape.y *= sy;
            if (shape.type === 'circle') {
                shape.radius *= (sx + sy) * 0.5;
            } else {
                shape.width *= sx;
                shape.height *= sy;
            }
        });
    }
}

function resetLightLab() {
    if (!workspaceEl) {
        return;
    }
    const width = Math.max(1, Math.floor(workspaceEl.clientWidth));
    const height = Math.max(1, Math.floor(workspaceEl.clientHeight));
    lightLabState.width = width;
    lightLabState.height = height;
    lightLabState.laser.x = width * 0.17;
    lightLabState.laser.y = height * 0.55;
    lightLabState.laser.angleDeg = -18;
    lightLabState.laser.handleDistance = Math.min(width, height) * 0.12;
    lightLabState.shapes = createDefaultLightShapes(width, height);
    selectedShapeIndex = 0;
    lightMode = 'full';
    lightSpectrumSamples = 80;
    branchMode = 'both';
    if (lightModeEl) lightModeEl.value = lightMode;
    if (spectrumSamplesEl) spectrumSamplesEl.value = String(lightSpectrumSamples);
    if (branchModeEl) branchModeEl.value = branchMode;
    if (laserAngleEl) laserAngleEl.value = lightLabState.laser.angleDeg;
    if (newShapeTypeEl) newShapeTypeEl.value = 'slab';
    syncSelectedShapeControls();
    updateBranchModeVisibility();
    updateLightLabLabels();
}

function renderLightLab() {
    if (!lightCtx || !lightCanvas) {
        return;
    }

    const { width, height } = lightCanvas;
    lightCtx.clearRect(0, 0, width, height);

    const bg = lightCtx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#09111d');
    bg.addColorStop(1, '#04070d');
    lightCtx.fillStyle = bg;
    lightCtx.fillRect(0, 0, width, height);

    lightCtx.save();
    lightCtx.strokeStyle = 'rgba(160, 196, 255, 0.06)';
    lightCtx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
        lightCtx.beginPath();
        lightCtx.moveTo(x, 0);
        lightCtx.lineTo(x, height);
        lightCtx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
        lightCtx.beginPath();
        lightCtx.moveTo(0, y);
        lightCtx.lineTo(width, y);
        lightCtx.stroke();
    }
    lightCtx.restore();

    lightLabState.shapes.forEach((shape, index) => {
        drawLightShape(shape, index === selectedShapeIndex);
    });

    const segments = [];
    const normals = [];
    const sourceOrigin = { x: lightLabState.laser.x, y: lightLabState.laser.y };
    const sourceDirection = getLaserDirection();

    if (lightMode === 'full') {
        const spectrum = getFullSpectrumSamples();
        const spectralBoost = Math.min(1.0, 18 / Math.max(1, spectrum.length));
        for (const sample of spectrum) {
            const segmentsForWavelength = [];
            const normalsForWavelength = [];
            traceLightRay(
                sourceOrigin,
                sourceDirection,
                1.0,
                0,
                1.0,
                segmentsForWavelength,
                normalsForWavelength,
                {
                    mode: 'full',
                    wavelengthNm: sample.wavelengthNm,
                    branchLimit: 'both',
                    sourceColor: sample.color,
                    spectralBoost,
                }
            );
            segments.push(...segmentsForWavelength);
            normals.push(...normalsForWavelength);
        }
    } else if (lightMode === 'white') {
        traceLightRay(
            sourceOrigin,
            sourceDirection,
            1.0,
            0,
            1.0,
            segments,
            normals,
            {
                mode: 'white',
                wavelengthNm: 550,
                branchLimit: 'refraction',
                sourceColor: { r: 1, g: 1, b: 1 },
                spectralBoost: 1.0,
            }
        );
    } else if (lightMode === 'path') {
        traceLightRay(
            sourceOrigin,
            sourceDirection,
            1.0,
            0,
            1.0,
            segments,
            normals,
            {
                mode: 'path',
                wavelengthNm: 550,
                branchLimit: 'refraction',
                sourceColor: { r: 1, g: 1, b: 1 },
                spectralBoost: 1.0,
            }
        );
    } else {
        traceLightRay(
            sourceOrigin,
            sourceDirection,
            1.0,
            0,
            1.0,
            segments,
            normals,
            {
                mode: 'split',
                wavelengthNm: 550,
                branchLimit: branchMode,
                sourceColor: { r: 1, g: 1, b: 1 },
                spectralBoost: 1.0,
            }
        );
    }

    for (const segment of segments) {
        lightCtx.save();
        lightCtx.globalCompositeOperation = 'lighter';
        lightCtx.strokeStyle = segment.color;
        lightCtx.lineWidth = segment.width;
        lightCtx.lineCap = 'round';
        lightCtx.beginPath();
        lightCtx.moveTo(segment.start.x, segment.start.y);
        lightCtx.lineTo(segment.end.x, segment.end.y);
        lightCtx.stroke();
        lightCtx.restore();
    }

    for (const hit of normals) {
        lightCtx.save();
        lightCtx.setLineDash([6, 6]);
        lightCtx.strokeStyle = 'rgba(245, 248, 255, 0.36)';
        lightCtx.lineWidth = 1;
        lightCtx.beginPath();
        lightCtx.moveTo(hit.point.x - hit.normal.x * 34, hit.point.y - hit.normal.y * 34);
        lightCtx.lineTo(hit.point.x + hit.normal.x * 34, hit.point.y + hit.normal.y * 34);
        lightCtx.stroke();
        lightCtx.restore();
    }

    const handle = getLaserHandlePosition();
    lightCtx.save();
    lightCtx.strokeStyle = 'rgba(255, 221, 109, 0.4)';
    lightCtx.lineWidth = 2;
    lightCtx.beginPath();
    lightCtx.moveTo(lightLabState.laser.x, lightLabState.laser.y);
    lightCtx.lineTo(handle.x, handle.y);
    lightCtx.stroke();

    lightCtx.fillStyle = '#ffd965';
    lightCtx.beginPath();
    lightCtx.arc(lightLabState.laser.x, lightLabState.laser.y, 10, 0, Math.PI * 2);
    lightCtx.fill();

    lightCtx.fillStyle = '#82e7ff';
    lightCtx.beginPath();
    lightCtx.arc(handle.x, handle.y, 8, 0, Math.PI * 2);
    lightCtx.fill();
    lightCtx.restore();
}

function getLightCanvasPoint(event) {
    if (!lightCanvas) {
        return null;
    }
    const rect = lightCanvas.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * lightCanvas.width,
        y: ((event.clientY - rect.top) / rect.height) * lightCanvas.height,
    };
}

function bindLightLabControls() {
    lightCanvas = document.getElementById('lightCanvas');
    lightCtx = lightCanvas ? lightCanvas.getContext('2d') : null;
    lightModeEl = document.getElementById('lightMode');
    spectrumSamplesEl = document.getElementById('spectrumSamples');
    branchModeEl = document.getElementById('branchMode');
    spectrumSamplesWrapEl = document.getElementById('spectrumSamplesWrap');
    branchModeWrapEl = document.getElementById('branchModeWrap');
    newShapeTypeEl = document.getElementById('newShapeType');
    shapeListEl = document.getElementById('shapeList');
    addShapeEl = document.getElementById('addShape');
    deleteShapeEl = document.getElementById('deleteShape');
    laserAngleEl = document.getElementById('laserAngle');
    glassIorEl = document.getElementById('glassIor');
    glassRotationEl = document.getElementById('glassRotation');
    resetLightLabEl = document.getElementById('resetLightLab');

    if (lightModeEl) {
        lightModeEl.addEventListener('change', () => {
            lightMode = lightModeEl.value;
            updateBranchModeVisibility();
        });
    }
    if (spectrumSamplesEl) {
        spectrumSamplesEl.addEventListener('input', () => {
            lightSpectrumSamples = parseInt(spectrumSamplesEl.value, 10) || 1;
            updateLightLabLabels();
        });
    }
    if (branchModeEl) {
        branchModeEl.addEventListener('change', () => {
            branchMode = branchModeEl.value;
        });
    }
    if (newShapeTypeEl) {
        newShapeTypeEl.addEventListener('change', () => {
            updateLightLabLabels();
        });
    }

    if (laserAngleEl) {
        laserAngleEl.addEventListener('input', () => {
            lightLabState.laser.angleDeg = parseFloat(laserAngleEl.value);
            updateLightLabLabels();
        });
    }
    if (glassIorEl) {
        glassIorEl.addEventListener('input', () => {
            const shape = getSelectedShape();
            if (shape) {
                shape.ior = parseFloat(glassIorEl.value);
            }
            updateLightLabLabels();
        });
    }
    if (glassRotationEl) {
        glassRotationEl.addEventListener('input', () => {
            const shape = getSelectedShape();
            if (shape) {
                shape.rotationDeg = parseFloat(glassRotationEl.value);
            }
            updateLightLabLabels();
        });
    }
    if (addShapeEl) {
        addShapeEl.addEventListener('click', () => {
            addLightShape(newShapeTypeEl ? newShapeTypeEl.value : 'slab');
        });
    }
    if (deleteShapeEl) {
        deleteShapeEl.addEventListener('click', () => {
            deleteSelectedShape();
        });
    }
    if (resetLightLabEl) {
        resetLightLabEl.addEventListener('click', () => {
            resetLightLab();
        });
    }

    if (lightCanvas) {
        lightCanvas.addEventListener('pointerdown', (event) => {
            const point = getLightCanvasPoint(event);
            if (!point) {
                return;
            }
            const sourceDist = Math.hypot(point.x - lightLabState.laser.x, point.y - lightLabState.laser.y);
            const handle = getLaserHandlePosition();
            const handleDist = Math.hypot(point.x - handle.x, point.y - handle.y);
            if (sourceDist < 16) {
                lightLabState.dragMode = 'laser';
                lightLabState.dragOffsetX = point.x - lightLabState.laser.x;
                lightLabState.dragOffsetY = point.y - lightLabState.laser.y;
            } else if (handleDist < 16) {
                lightLabState.dragMode = 'aim';
            } else {
                const hitShape = selectShapeAtPoint(point);
                if (hitShape) {
                    lightLabState.dragMode = 'shape';
                    lightLabState.dragOffsetX = point.x - hitShape.x;
                    lightLabState.dragOffsetY = point.y - hitShape.y;
                }
            }
            if (lightLabState.dragMode) {
                lightCanvas.setPointerCapture(event.pointerId);
            }
        });

        lightCanvas.addEventListener('pointermove', (event) => {
            if (!lightLabState.dragMode) {
                return;
            }
            const point = getLightCanvasPoint(event);
            if (!point) {
                return;
            }
            if (lightLabState.dragMode === 'laser') {
                lightLabState.laser.x = clamp(point.x - lightLabState.dragOffsetX, 30, lightLabState.width - 30);
                lightLabState.laser.y = clamp(point.y - lightLabState.dragOffsetY, 30, lightLabState.height - 30);
            } else if (lightLabState.dragMode === 'aim') {
                setLaserAngleFromDirection(subVec2(point, lightLabState.laser));
            } else if (lightLabState.dragMode === 'shape') {
                const shape = getSelectedShape();
                if (shape) {
                    const minX = 40;
                    const minY = 40;
                    const maxX = lightLabState.width - 40;
                    const maxY = lightLabState.height - 40;
                    shape.x = clamp(point.x - lightLabState.dragOffsetX, minX, maxX);
                    shape.y = clamp(point.y - lightLabState.dragOffsetY, minY, maxY);
                }
            }
        });

        const endDrag = () => {
            lightLabState.dragMode = null;
        };
        lightCanvas.addEventListener('pointerup', endDrag);
        lightCanvas.addEventListener('pointercancel', endDrag);
    }

    updateLightLabLabels();
    updateBranchModeVisibility();
}

function updateBranchModeVisibility() {
    if (!branchModeWrapEl) {
        return;
    }
    branchModeWrapEl.style.display = lightMode === 'split' ? 'block' : 'none';
    if (spectrumSamplesWrapEl) {
        spectrumSamplesWrapEl.style.display = lightMode === 'full' ? 'block' : 'none';
    }
}

function setActiveTab(tabName) {
    activeTab = tabName;
    const solarActive = tabName === 'solar';
    tabSolarEl.classList.toggle('active', solarActive);
    tabLightEl.classList.toggle('active', !solarActive);
    solarPanelEl.classList.toggle('active', solarActive);
    lightPanelEl.classList.toggle('active', !solarActive);
    canvasContainerEl.classList.toggle('active', solarActive);
    lightLabContainerEl.classList.toggle('active', !solarActive);
    if (!solarActive && document.pointerLockElement === canvas) {
        document.exitPointerLock();
    }
}

function bindTabs() {
    tabSolarEl = document.getElementById('tabSolar');
    tabLightEl = document.getElementById('tabLight');
    solarPanelEl = document.getElementById('solarPanel');
    lightPanelEl = document.getElementById('lightPanel');
    canvasContainerEl = document.getElementById('canvasContainer');
    lightLabContainerEl = document.getElementById('lightLabContainer');
    workspaceEl = document.getElementById('workspace');

    if (tabSolarEl) {
        tabSolarEl.addEventListener('click', () => setActiveTab('solar'));
    }
    if (tabLightEl) {
        tabLightEl.addEventListener('click', () => setActiveTab('light'));
    }
    setActiveTab('solar');
}

function intersectRaySphere(origin, direction, center, radius) {
    const ox = origin.x - center.x;
    const oy = origin.y - center.y;
    const oz = origin.z - center.z;
    const b = ox * direction.x + oy * direction.y + oz * direction.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    let t = -b - s;
    if (t < 0.001) {
        t = -b + s;
        if (t < 0.001) return -1;
    }
    return t;
}

function pickPlanetAt(clientX, clientY, targetCanvas = canvas) {
    const ray = getCameraRayFromCanvas(targetCanvas, clientX, clientY);
    if (!ray) {
        return false;
    }
    const positions = getPlanetPositions(simTime);
    let bestIndex = -1;
    let bestT = Infinity;

    for (let i = 0; i < planetData.length; i += 1) {
        const t = intersectRaySphere(ray.origin, ray.direction, positions[i], planetData[i].radius);
        if (t > 0 && t < bestT) {
            bestT = t;
            bestIndex = i;
        }
    }

    if (bestIndex !== -1) {
        setSelectedPlanet(bestIndex);
        return true;
    }

    return false;
}

function hoverPlanetAt(clientX, clientY, targetCanvas = canvas) {
    const ray = getCameraRayFromCanvas(targetCanvas, clientX, clientY);
    if (!ray) {
        setHoveredPlanet(-1);
        return;
    }
    const positions = getPlanetPositions(simTime);
    let bestIndex = -1;
    let bestT = Infinity;

    for (let i = 0; i < planetData.length; i += 1) {
        const t = intersectRaySphere(ray.origin, ray.direction, positions[i], planetData[i].radius);
        if (t > 0 && t < bestT) {
            bestT = t;
            bestIndex = i;
        }
    }

    setHoveredPlanet(bestIndex);
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function mixNumber(a, b, t) {
    return a + (b - a) * t;
}

function hexToRgb01(hex) {
    const normalized = hex.trim().replace('#', '');
    const full = normalized.length === 3
        ? normalized.split('').map((ch) => ch + ch).join('')
        : normalized.padEnd(6, '0').slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    return { r, g, b };
}

function hash32(value) {
    let x = value >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
}

function randFloat(seed) {
    return hash32(seed) / 4294967296;
}

function cpuPhaseHG(cosTheta, g) {
    const g2 = g * g;
    const denom = Math.max(1e-3, 1 + g2 - 2 * g * cosTheta);
    return (1 - g2) / (4 * Math.PI * Math.pow(denom, 1.5));
}

function cpuIntersectSphereBounds(ray, center, radius) {
    const ox = ray.origin.x - center.x;
    const oy = ray.origin.y - center.y;
    const oz = ray.origin.z - center.z;
    const b = ox * ray.direction.x + oy * ray.direction.y + oz * ray.direction.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const disc = b * b - c;
    if (disc < 0) {
        return { min: 1e20, max: -1 };
    }
    const s = Math.sqrt(disc);
    return { min: -b - s, max: -b + s };
}

function cpuIntersectDisk(ray, center, innerR, outerR) {
    if (Math.abs(ray.direction.y) < 1e-6) return -1;
    const t = (center.y - ray.origin.y) / ray.direction.y;
    if (t < 0.001) return -1;
    const p = {
        x: ray.origin.x + t * ray.direction.x,
        y: ray.origin.y + t * ray.direction.y,
        z: ray.origin.z + t * ray.direction.z,
    };
    const dx = p.x - center.x;
    const dz = p.z - center.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < innerR * innerR || d2 > outerR * outerR) return -1;
    return t;
}

function cpuCoronaDensity(point, center, sunRadius) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dz = point.z - center.z;
    const r = Math.hypot(dx, dy, dz);
    if (r <= sunRadius) {
        return 0;
    }
    const surfaceDistance = r - sunRadius;
    const scaleHeight = Math.max(sunRadius * CPU_CORONA_DENSITY_FALLOFF, 1e-3);
    return Math.exp(-surfaceDistance / scaleHeight);
}

function cpuStarField(dir) {
    const theta = Math.atan2(dir.z, dir.x);
    const phi = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const cellX = Math.floor(theta * 500.0);
    const cellY = Math.floor(phi * 500.0);
    const seed = (cellX + cellY * 3141 + 50000) | 0;
    const h = randFloat(seed >>> 0);
    if (h < 0.003) {
        const brightness = 0.15 + 0.6 * ((h * 333.0) % 1);
        const temp = randFloat((seed + 1) >>> 0);
        const warm = { r: 1.0, g: 0.9, b: 0.7 };
        const cool = { r: 0.7, g: 0.8, b: 1.0 };
        return {
            r: mixNumber(cool.r, warm.r, temp) * brightness,
            g: mixNumber(cool.g, warm.g, temp) * brightness,
            b: mixNumber(cool.b, warm.b, temp) * brightness,
        };
    }
    return { r: 0, g: 0, b: 0 };
}

function cpuGetPlanetColor(i) {
    const planet = planetData[i];
    if (!planet || !planet.color) {
        return { r: 1, g: 1, b: 1 };
    }
    return hexToRgb01(planet.color);
}

function cpuShadeRay(ray, positions, pixelSeed) {
    const sunPos = positions[0];
    const sunRadius = planetData[0].radius;
    const sunCoronaRadius = sunRadius * CPU_CORONA_RADIUS_SCALE;
    const coronaHit = cpuIntersectSphereBounds(ray, sunPos, sunCoronaRadius);

    const saturnPos = positions[6];
    const ringInner = planetData[6].radius * 1.5;
    const ringOuter = planetData[6].radius * 2.5;

    let closestT = 1e20;
    let hitIdx = -1;
    let hitRing = false;

    for (let i = 0; i < planetData.length; i += 1) {
        const t = intersectRaySphere(ray.origin, ray.direction, positions[i], planetData[i].radius);
        if (t > 0 && t < closestT) {
            closestT = t;
            hitIdx = i;
            hitRing = false;
        }
    }

    const ringT = cpuIntersectDisk(ray, saturnPos, ringInner, ringOuter);
    if (ringT > 0 && ringT < closestT) {
        closestT = ringT;
        hitIdx = 100;
        hitRing = true;
    }

    let volumeColor = { r: 0, g: 0, b: 0 };
    let transmittance = 1.0;
    const marchEnd = hitIdx >= 0 ? closestT : 140.0;
    const marchStart = Math.max(0, coronaHit.min);
    const volumeEnd = Math.min(marchEnd, coronaHit.max);

    if (volumeEnd > marchStart) {
        const stepLen = (volumeEnd - marchStart) / CPU_CORONA_STEPS;
        for (let step = 0; step < CPU_CORONA_STEPS; step += 1) {
            const t = marchStart + (step + 0.5) * stepLen;
            const samplePos = {
                x: ray.origin.x + ray.direction.x * t,
                y: ray.origin.y + ray.direction.y * t,
                z: ray.origin.z + ray.direction.z * t,
            };
            const density = cpuCoronaDensity(samplePos, sunPos, sunRadius);
            if (density <= 1e-4) {
                continue;
            }

            const toSun = {
                x: sunPos.x - samplePos.x,
                y: sunPos.y - samplePos.y,
                z: sunPos.z - samplePos.z,
            };
            const sunDist = Math.hypot(toSun.x, toSun.y, toSun.z);
            const sunDir = {
                x: toSun.x / Math.max(sunDist, 1e-3),
                y: toSun.y / Math.max(sunDist, 1e-3),
                z: toSun.z / Math.max(sunDist, 1e-3),
            };
            const cosTheta = -(ray.direction.x * sunDir.x + ray.direction.y * sunDir.y + ray.direction.z * sunDir.z);
            const phase = cpuPhaseHG(cosTheta, CPU_CORONA_G);
            const falloff = 1 / (1 + sunDist * sunDist * 0.018);
            const sunRadiance = { r: 8 * falloff, g: 6 * falloff, b: 3.5 * falloff };
            const strength = density * CPU_CORONA_SCATTERING * phase * stepLen * transmittance;
            volumeColor.r += sunRadiance.r * strength;
            volumeColor.g += sunRadiance.g * strength;
            volumeColor.b += sunRadiance.b * strength;
            transmittance *= Math.exp(-density * CPU_CORONA_EXTINCTION * stepLen);
        }
    }

    let sampleColor = { r: 0, g: 0, b: 0 };
    if (hitIdx >= 0) {
        const hitPoint = {
            x: ray.origin.x + closestT * ray.direction.x,
            y: ray.origin.y + closestT * ray.direction.y,
            z: ray.origin.z + closestT * ray.direction.z,
        };

        if (hitIdx === 0) {
            const n = normalizeVec3({
                x: hitPoint.x - sunPos.x,
                y: hitPoint.y - sunPos.y,
                z: hitPoint.z - sunPos.z,
            });
            const noise = ((Math.sin((n.x * 15 + simTime * 0.5) * 12.9898 + (n.z * 15 + simTime * 0.5) * 78.233) * 43758.5453) % 1 + 1) % 1;
            const glow = mixNumber(0.55, 1.0, noise * 0.4 + 0.6);
            sampleColor = {
                r: glow * 3.0,
                g: (0.55 + 0.45 * glow) * 3.0,
                b: (0.1 + 0.75 * glow) * 3.0,
            };
        } else if (hitRing) {
            const dx = hitPoint.x - saturnPos.x;
            const dz = hitPoint.z - saturnPos.z;
            const ringDist = Math.sqrt(dx * dx + dz * dz);
            const ringFrac = (ringDist - ringInner) / (ringOuter - ringInner);
            const gap = smoothstep(0.52, 0.56, ringFrac) * (1 - smoothstep(0.60, 0.64, ringFrac));
            const bands = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(ringFrac * 30));
            const ringAlbedo = {
                r: 0.72 * (1 - gap * 0.8) * bands,
                g: 0.65 * (1 - gap * 0.8) * bands,
                b: 0.48 * (1 - gap * 0.8) * bands,
            };
            const toSun = normalizeVec3({
                x: sunPos.x - hitPoint.x,
                y: sunPos.y - hitPoint.y,
                z: sunPos.z - hitPoint.z,
            });
            const normal = ray.direction.y < 0 ? { x: 0, y: -1, z: 0 } : { x: 0, y: 1, z: 0 };
            const ndotl = Math.max(normal.x * toSun.x + normal.y * toSun.y + normal.z * toSun.z, 0);
            sampleColor = {
                r: ringAlbedo.r * (ndotl * 1.4 + 0.04),
                g: ringAlbedo.g * (ndotl * 1.4 + 0.04),
                b: ringAlbedo.b * (ndotl * 1.4 + 0.04),
            };
        } else {
            const planetIdx = hitIdx;
            const normal = normalizeVec3({
                x: hitPoint.x - positions[planetIdx].x,
                y: hitPoint.y - positions[planetIdx].y,
                z: hitPoint.z - positions[planetIdx].z,
            });
            const albedo = cpuGetPlanetColor(planetIdx);
            const isSelected = selectedPlanetIndex >= 0 && planetIdx === selectedPlanetIndex;
            const isHovered = hoveredPlanetIndex >= 0 && planetIdx === hoveredPlanetIndex;
            const toSun = normalizeVec3({
                x: sunPos.x - hitPoint.x,
                y: sunPos.y - hitPoint.y,
                z: sunPos.z - hitPoint.z,
            });
            const ndotl = Math.max(normal.x * toSun.x + normal.y * toSun.y + normal.z * toSun.z, 0);

            let inShadow = false;
            const shadowRay = {
                origin: {
                    x: hitPoint.x + normal.x * 0.001,
                    y: hitPoint.y + normal.y * 0.001,
                    z: hitPoint.z + normal.z * 0.001,
                },
                direction: toSun,
            };
            const sunDist = Math.hypot(sunPos.x - hitPoint.x, sunPos.y - hitPoint.y, sunPos.z - hitPoint.z);
            for (let j = 0; j < planetData.length; j += 1) {
                if (j === planetIdx || j === 0) continue;
                const st = intersectRaySphere(shadowRay.origin, shadowRay.direction, positions[j], planetData[j].radius);
                if (st > 0 && st < sunDist) {
                    inShadow = true;
                    break;
                }
            }
            if (!inShadow && planetIdx === 6) {
                const rt = cpuIntersectDisk(shadowRay, saturnPos, ringInner, ringOuter);
                if (rt > 0 && rt < sunDist) {
                    inShadow = true;
                }
            }

            const light = inShadow ? 0.02 : (ndotl * 1.5 + 0.03);
            sampleColor = {
                r: albedo.r * light,
                g: albedo.g * light,
                b: albedo.b * light,
            };

            if (isSelected) {
                const viewFacing = Math.max(normal.x * -ray.direction.x + normal.y * -ray.direction.y + normal.z * -ray.direction.z, 0);
                const rim = Math.pow(1 - viewFacing, 3);
                sampleColor.r = sampleColor.r * 1.25 + 0.18 + rim * 0.28;
                sampleColor.g = sampleColor.g * 1.25 + 0.16 + rim * 0.22;
                sampleColor.b = sampleColor.b * 1.25 + 0.04 + rim * 0.06;
            } else if (isHovered) {
                const viewFacing = Math.max(normal.x * -ray.direction.x + normal.y * -ray.direction.y + normal.z * -ray.direction.z, 0);
                const rim = Math.pow(1 - viewFacing, 2.5);
                sampleColor.r = sampleColor.r * 1.1 + 0.12 + rim * 0.18;
                sampleColor.g = sampleColor.g * 1.1 + 0.14 + rim * 0.22;
                sampleColor.b = sampleColor.b * 1.1 + 0.18 + rim * 0.3;
            }
        }
    } else {
        sampleColor = cpuStarField(ray.direction);
    }

    let color = {
        r: volumeColor.r + transmittance * sampleColor.r,
        g: volumeColor.g + transmittance * sampleColor.g,
        b: volumeColor.b + transmittance * sampleColor.b,
    };

    color.r = color.r / (color.r + 1);
    color.g = color.g / (color.g + 1);
    color.b = color.b / (color.b + 1);

    color.r = Math.pow(Math.max(color.r, 0), 1 / 2.2);
    color.g = Math.pow(Math.max(color.g, 0), 1 / 2.2);
    color.b = Math.pow(Math.max(color.b, 0), 1 / 2.2);

    return color;
}

function bindSceneCanvasInteractions(targetCanvas, allowPointerLock) {
    if (!targetCanvas) {
        return;
    }

    targetCanvas.addEventListener('pointermove', (e) => {
        if (document.pointerLockElement === canvas && targetCanvas === canvas) {
            return;
        }
        hoverPlanetAt(e.clientX, e.clientY, targetCanvas);
    });

    targetCanvas.addEventListener('mouseleave', () => {
        if (document.pointerLockElement !== canvas) {
            setHoveredPlanet(-1);
        }
    });

    targetCanvas.addEventListener('click', (e) => {
        const picked = pickPlanetAt(e.clientX, e.clientY, targetCanvas);
        if (!picked && allowPointerLock) {
            canvas.requestPointerLock();
        }
    });
}

function bindInspectorControls() {
    planetListEl = document.getElementById('planetList');
    planetInfoEl = document.getElementById('planetInfo');
    planetSearchEl = document.getElementById('planetSearch');
    pauseToggleEl = document.getElementById('pauseToggle');
    focusToggleEl = document.getElementById('focusToggle');

    if (planetSearchEl) {
        planetSearchEl.addEventListener('input', () => {
            updatePlanetList(planetSearchEl.value);
            const normalized = planetSearchEl.value.trim().toLowerCase();
            const exact = planetData.findIndex((planet) => planet.name.toLowerCase() === normalized);
            if (exact !== -1) {
                selectedPlanetIndex = exact;
                updatePlanetInfo();
                updatePlanetList(planetSearchEl.value);
            }
        });
        planetSearchEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const resolved = resolvePlanetFromQuery(planetSearchEl.value);
                if (resolved !== -1) {
                    setSelectedPlanet(resolved);
                }
            }
        });
    }

    if (pauseToggleEl) {
        pauseToggleEl.addEventListener('click', () => {
            simPaused = !simPaused;
            updatePauseToggle();
        });
    }

    if (focusToggleEl) {
        focusToggleEl.addEventListener('click', () => {
            focusSelected = !focusSelected;
            updateFocusToggle();
        });
    }

    updatePauseToggle();
    updateFocusToggle();
    updatePlanetList('');
    updatePlanetInfo();
}

function resizeCanvas() {
    if (!canvas || !workspaceEl) {
        return;
    }

    const gpuWidth = Math.max(1, Math.floor(workspaceEl.clientWidth));
    const gpuHeight = Math.max(1, Math.floor(workspaceEl.clientHeight));

    canvas.width = gpuWidth;
    canvas.height = gpuHeight;
    resizeLightCanvas();

    if (outputTexture) {
        outputTexture.destroy();
        outputTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: format,
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: outputTexture.createView(),
            }, {
                binding: 1,
                resource: { buffer: uniformBuffer },
            }],
        });
        renderBindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: outputTexture.createView(),
            }],
        });
    }
}

async function initWebGPU() {
    try {
        bindTabs();
        canvas = document.getElementById('canvas');
        bindLightLabControls();
        resizeCanvas();
        resetLightLab();
        await loadPlanetData();
        
        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: "high-performance"
        });

        uniformBuffer = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        context = canvas.getContext('webgpu');
        format = 'rgba8unorm';
        context.configure({ device, format });

        outputTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: format,
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        const vertexShaderResponse = await fetch('../shaders/vertex.wgsl');
        const vertexShaderCode = await vertexShaderResponse.text();
        const fragmentShaderResponse = await fetch('../shaders/fragment.wgsl');
        const fragmentShaderCode = await fragmentShaderResponse.text();
        const computeShaderResponse = await fetch('../shaders/compute.wgsl');
        const computeShaderCode = await computeShaderResponse.text();

        const vertexModule = device.createShaderModule({ code: vertexShaderCode });
        const fragmentModule = device.createShaderModule({ code: fragmentShaderCode });
        const computeModule = device.createShaderModule({ code: computeShaderCode });

        computePipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'main' },
        });

        pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: vertexModule, entryPoint: 'main' },
            fragment: {
                module: fragmentModule,
                entryPoint: 'main',
                targets: [{ format }],
            },
            primitive: { topology: 'triangle-strip' },
        });

        computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: outputTexture.createView(),
            }, {
                binding: 1,
                resource: { buffer: uniformBuffer },
            }],
        });

        renderBindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: outputTexture.createView(),
            }],
        });

        bindSlider('sppSlider', 'sppValue', 'spp');
        bindSlider('timeSpeed', 'timeSpeedValue', 'timeSpeed');
        bindInspectorControls();

        window.addEventListener('resize', () => resizeCanvas());

        document.addEventListener('keydown', (e) => {
            keyState[e.key.toLowerCase()] = true;
        });
        document.addEventListener('keyup', (e) => {
            keyState[e.key.toLowerCase()] = false;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== canvas) return;
            const sensitivity = 0.002;
            sliderState.cameraYaw += e.movementX * sensitivity;
            sliderState.cameraPitch -= e.movementY * sensitivity;
            sliderState.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, sliderState.cameraPitch));
        });

        bindSceneCanvasInteractions(canvas, true);

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                sliderState.moveSpeed *= 1.25;
            } else {
                sliderState.moveSpeed /= 1.25;
            }
            sliderState.moveSpeed = Math.max(0.1, Math.min(500, sliderState.moveSpeed));
            const label = document.getElementById('speedValue');
            if (label) label.textContent = sliderState.moveSpeed.toFixed(1);
        }, { passive: false });

        console.log('WebGPU initialized successfully!');
        lastFrameTime = performance.now();
        requestAnimationFrame(animate);
    } catch (e) {
        console.log('WebGPU failed!');
        console.error(e);
    }
}

function animate(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    const simDt = simPaused ? 0 : dt;
    simTime += simDt * sliderState.timeSpeed;
    updatePlanetInfo();
    if (focusSelected && selectedPlanetIndex >= 0) {
        const target = getPlanetPositions(simTime)[selectedPlanetIndex];
        const dx = target.x - sliderState.cameraPosX;
        const dy = target.y - sliderState.cameraPosY;
        const dz = target.z - sliderState.cameraPosZ;
        const horiz = Math.hypot(dx, dz) || 1;
        const desiredYaw = Math.atan2(dx, -dz);
        const desiredPitch = Math.atan2(dy, horiz);
        const yawDelta = Math.atan2(Math.sin(desiredYaw - sliderState.cameraYaw), Math.cos(desiredYaw - sliderState.cameraYaw));
        sliderState.cameraYaw += yawDelta * Math.min(1, dt * 8.0);
        sliderState.cameraPitch += (desiredPitch - sliderState.cameraPitch) * Math.min(1, dt * 8.0);
        sliderState.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, sliderState.cameraPitch));
    }

    // Movement
    const speed = sliderState.moveSpeed * dt;
    const yaw = sliderState.cameraYaw;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    const fwdX = sinY;
    const fwdZ = -cosY;
    const rightX = cosY;
    const rightZ = sinY;

    if (keyState['w']) {
        sliderState.cameraPosX += fwdX * speed;
        sliderState.cameraPosZ += fwdZ * speed;
    }
    if (keyState['s']) {
        sliderState.cameraPosX -= fwdX * speed;
        sliderState.cameraPosZ -= fwdZ * speed;
    }
    if (keyState['a']) {
        sliderState.cameraPosX -= rightX * speed;
        sliderState.cameraPosZ -= rightZ * speed;
    }
    if (keyState['d']) {
        sliderState.cameraPosX += rightX * speed;
        sliderState.cameraPosZ += rightZ * speed;
    }
    if (keyState[' ']) {
        sliderState.cameraPosY += speed;
    }
    if (keyState['shift']) {
        sliderState.cameraPosY -= speed;
    }

    if (activeTab === 'solar') {
        render();
    } else {
        renderLightLab();
    }
    requestAnimationFrame(animate);
}

function render() {
    const commandEncoder = device.createCommandEncoder();
    const uniformData = new ArrayBuffer(64);
    const u32View = new Uint32Array(uniformData);
    const f32View = new Float32Array(uniformData);

    u32View[0] = sliderState.spp;
    u32View[1] = 1;
    f32View[2] = simTime;
    // [3] = pad
    f32View[4] = sliderState.cameraPosX;
    f32View[5] = sliderState.cameraPosY;
    f32View[6] = sliderState.cameraPosZ;
    f32View[7] = sliderState.cameraPitch;
    f32View[8] = sliderState.cameraYaw;
    u32View[9] = selectedPlanetIndex >= 0 ? selectedPlanetIndex : 0xFFFFFFFF;
    u32View[10] = focusSelected ? 1 : 0;
    u32View[11] = hoveredPlanetIndex >= 0 ? hoveredPlanetIndex : 0xFFFFFFFF;
    u32View[12] = 0;

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(canvas.width / 16), Math.ceil(canvas.height / 16));
    computePass.end();

    const textureView = context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
        }],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(4);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
}

initWebGPU();
