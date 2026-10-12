import * as THREE from './assets/vendor/three.module.js';
import { RoundedBoxGeometry } from './assets/vendor/RoundedBoxGeometry.js';

// A local, original driving scene. The game physics in app.js remains the source of truth.
const mount = document.getElementById('driveScene');

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.34;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.7));
  renderer.setSize(1, 1, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  mount.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xaf796f, 0.0027);
  const camera = new THREE.PerspectiveCamera(59, 1, 0.1, 1300);

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uMood: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uMood;
      uniform float uTime;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y); }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * .85 + .28, 0.0, 1.0);
        vec3 duskLow = vec3(.88,.42,.31), duskHigh = vec3(.30,.15,.26);
        vec3 dayLow = vec3(.98,.75,.55), dayHigh = vec3(.16,.43,.70);
        vec3 nightLow = vec3(.18,.18,.30), nightHigh = vec3(.018,.035,.11);
        vec3 low = uMood < .5 ? duskLow : (uMood < 1.5 ? dayLow : nightLow);
        vec3 high = uMood < .5 ? duskHigh : (uMood < 1.5 ? dayHigh : nightHigh);
        vec3 col = mix(low, high, smoothstep(.10,.87,h));
        float cloud = noise(d.xz * 9.0 + vec2(d.y * 3.0, uTime * .008)) * .64 + noise(d.xz * 24.0) * .36;
        float bands = smoothstep(.43,.70,cloud) * smoothstep(.10,.48,h) * (1.0-smoothstep(.70,1.0,h));
        col += bands * (uMood < 1.5 ? vec3(.15,.09,.08) : vec3(.035,.04,.07));
        vec3 sunDir = normalize(vec3(-.58,.15,-.80));
        float sun = max(0.0, dot(d,sunDir));
        col += vec3(1.0,.52,.24) * pow(sun, 32.0) * (uMood < 1.5 ? .35 : .05);
        col += vec3(1.0,.82,.57) * pow(sun, 900.0) * (uMood < 1.5 ? .85 : .02);
        gl_FragColor = vec4(col,1.0);
      }
    `
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 28, 18), skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);
  const sunsetBackgrounds = { wide: null, portrait: null };
  const backgroundLoader = new THREE.TextureLoader();
  for (const [layout, file] of [['wide', 'v800-drive-sky-wide.png'], ['portrait', 'v800-drive-sky-portrait.png']]) {
    backgroundLoader.load(`./${file}`, texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      sunsetBackgrounds[layout] = texture;
    });
  }

  const hemi = new THREE.HemisphereLight(0xffd3ac, 0x201e2a, 2.0);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffc397, 2.8);
  sunLight.position.set(-45, 70, -90);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -22; sunLight.shadow.camera.right = 22;
  sunLight.shadow.camera.top = 22; sunLight.shadow.camera.bottom = -22;
  sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 160;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);
  const rearFill = new THREE.DirectionalLight(0xffc49a, 1.35);
  rearFill.position.set(12, 12, 18);
  scene.add(rearFill);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x352a2b, roughness: .9 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(24, 1500), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -.035, -700);
  road.receiveShadow = true;
  scene.add(road);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1500), new THREE.MeshStandardMaterial({ color: 0x4b3439, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.12, -700); ground.receiveShadow = true; scene.add(ground);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .58, metalness: .13, ...extra });
  const paint = mat(0x1b171b, { metalness: .63, roughness: .3 });
  const champagne = mat(0xc49a74, { metalness: .58, roughness: .31 });
  const goldTrim = mat(0xf4c995, { metalness: .7, roughness: .26 });
  const glass = mat(0x10151c, { metalness: .38, roughness: .18 });
  const tire = mat(0x101014, { roughness: .96 });
  const rim = mat(0xd9c5a5, { metalness: .8, roughness: .23 });
  const redLamp = new THREE.MeshStandardMaterial({ color: 0xe74337, emissive: 0xff201b, emissiveIntensity: 1.8, roughness: .2 });
  const whiteLamp = new THREE.MeshStandardMaterial({ color: 0xffe8ba, emissive: 0xffd78e, emissiveIntensity: 2.5 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe7d5b3 });

  const box = (parent, w, h, d, x, y, z, material, radius = 0) => {
    const mesh = new THREE.Mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };

  const car = new THREE.Group();
  car.position.set(-3.1, 0, -6.4);
  car.scale.setScalar(1.12);
  scene.add(car);
  box(car, 2.38, .88, 5.88, 0, .93, 0, paint, .18);
  box(car, 2.33, .16, 5.65, 0, 1.34, -.01, champagne, .06);
  box(car, 2.18, 1.05, 5.28, 0, 1.89, -.03, champagne, .16);
  box(car, 2.25, .09, 5.5, 0, 2.43, -.03, champagne, .045);
  box(car, 2.17, .08, 5.6, 0, 2.29, -.02, paint, .025);
  // Black glass is inset into the tall MPV cabin; pillars keep the long side profile legible.
  for (const side of [-1, 1]) {
    box(car, .018, .66, 4.47, side * 1.099, 1.90, -.13, glass, .012);
    for (const z of [-1.43, .47, 2.02]) box(car, .045, .79, .075, side * 1.125, 1.88, z, champagne, .012);
    box(car, .026, .035, 5.12, side * 1.16, 1.47, -.05, goldTrim);
    box(car, .022, .024, 5.34, side * 1.19, .97, -.02, goldTrim);
    for (const z of [-1.25, 1.40]) box(car, .05, .04, .42, side * 1.20, 1.15, z, goldTrim, .01);
    box(car, .23, .14, .37, side * 1.28, 1.63, -1.77, paint, .04);
    box(car, .18, .045, .35, side * 1.29, 1.66, -1.76, champagne, .015);
  }
  // Rear face: tall illuminated edges and a thin full-width signature light.
  box(car, 1.96, .68, .025, 0, 1.92, 2.635, glass, .025);
  box(car, 2.14, .065, .035, 0, 1.36, 2.949, redLamp, .025);
  box(car, 1.94, .05, .025, 0, 2.31, 2.66, goldTrim, .015);
  for (const side of [-1, 1]) {
    box(car, .09, .66, .045, side * 1.09, 1.46, 2.945, redLamp, .025);
    box(car, .10, .11, .04, side * 1.05, .75, 2.94, redLamp, .018);
  }
  box(car, .65, .15, .025, 0, .83, 2.96, mat(0x0a0b0d), .016);
  box(car, .48, .055, .028, 0, .83, 2.98, goldTrim);
  box(car, 2.28, .14, .22, 0, .51, 2.87, paint, .06);
  // Front grille/lights are present for camera changes, though the main view is from behind.
  box(car, 1.74, .69, .025, 0, .93, -2.98, mat(0x191719), .08);
  for (const side of [-1, 1]) box(car, .08, .58, .036, side * 1.04, 1.16, -2.96, whiteLamp, .02);

  const wheels = [];
  for (const z of [-1.89, 1.91]) for (const side of [-1, 1]) {
    const wheel = new THREE.Group(); wheel.position.set(side * 1.16, .45, z); car.add(wheel);
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .24, 32), tire);
    rubber.rotation.z = Math.PI / 2; rubber.castShadow = true; wheel.add(rubber);
    const faceX = side * .145;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.30, .30, .018, 32), rim);
    hub.rotation.z = Math.PI / 2; hub.position.x = faceX; wheel.add(hub);
    const darkHub = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .024, 24), paint);
    darkHub.rotation.z = Math.PI / 2; darkHub.position.x = side * .16; wheel.add(darkHub);
    for (let i = 0; i < 18; i++) {
      const a = i * Math.PI * 2 / 18;
      const spoke = box(wheel, .018, .03, .22, side * .16, Math.sin(a) * .18, Math.cos(a) * .18, goldTrim, .005);
      spoke.rotation.x = -a;
    }
    wheels.push(wheel);
  }
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128; shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const shadowGradient = shadowContext.createRadialGradient(64, 64, 9, 64, 64, 63);
  shadowGradient.addColorStop(0, 'rgba(0,0,0,.7)');
  shadowGradient.addColorStop(.55, 'rgba(0,0,0,.34)');
  shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const carShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 6.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, opacity: .5, depthWrite: false }));
  carShadow.rotation.x = -Math.PI / 2; carShadow.position.set(-3.1, .015, -6.4); scene.add(carShadow);
  let carSprite = null;
  new THREE.TextureLoader().load('./v800-drive-sprite.png', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;
    texture.offset.x = 1;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: .035, depthWrite: false });
    carSprite = new THREE.Sprite(material);
    carSprite.position.set(-3.1, 1.92, -6.4);
    carSprite.renderOrder = 2;
    scene.add(carSprite);
    car.visible = false;
  });

  const dashMarks = [];
  for (let i = 0; i < 82; i++) for (const x of [-6, 0, 6]) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(.13, 4.6), lineMat);
    mark.rotation.x = -Math.PI / 2; mark.position.set(x, .005, 0); scene.add(mark); dashMarks.push({ mesh: mark, i });
  }
  for (const x of [-10.8, 10.8]) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(.17, 1500), new THREE.MeshBasicMaterial({ color: 0xd9b793 }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(x, .006, -700); scene.add(stripe);
    for (const y of [.46, .83]) {
      const rail = box(scene, .075, .09, 900, x * 1.12, y, -430, goldTrim, .025);
      rail.castShadow = false;
    }
  }

  const lampGroups = [];
  const poleMat = mat(0x2a252a, { metalness: .55, roughness: .5 });
  for (let i = 0; i < 29; i++) for (const side of [-1, 1]) {
    const group = new THREE.Group(); scene.add(group);
    box(group, .11, 8.2, .11, side * 12.0, 4.1, 0, poleMat, .025);
    box(group, 2.25, .10, .12, side * 10.92, 8.18, 0, poleMat, .025);
    box(group, .45, .045, .22, side * 9.96, 8.10, 0, whiteLamp, .012);
    lampGroups.push({ group, i });
  }

  const mountainMaterial = [0x76545a, 0x5f4452, 0x413442].map(color => new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
  const mountainMeshes = [];
  for (let layer = 0; layer < 3; layer++) {
    const verts = [];
    const baseY = -3 - layer * 2;
    const z = -560 + layer * 42;
    let lastX = -600, lastY = 7;
    for (let j = 1; j <= 55; j++) {
      const x = -600 + j * 22;
      const peak = 6 + Math.sin(j * .53 + layer) * 7 + Math.sin(j * .19 + layer * 2) * 13 + (layer === 2 ? 3 : 0);
      verts.push(lastX, baseY, z, lastX, lastY, z, x, peak, z);
      verts.push(lastX, baseY, z, x, peak, z, x, baseY, z);
      lastX = x; lastY = peak;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geometry.computeVertexNormals();
    const mountain = new THREE.Mesh(geometry, mountainMaterial[layer]);
    scene.add(mountain);
    mountainMeshes.push(mountain);
  }

  const barrier = new THREE.Group(); scene.add(barrier);
  for (let j = 0; j < 10; j++) box(barrier, 2.15, .48, .22, -9.7 + j * 2.15, .88, 0, j % 2 ? redLamp : whiteLamp, .02);
  for (const x of [-10.6, 10.6]) box(barrier, .18, 1.7, .18, x, .85, 0, poleMat, .025);
  barrier.visible = false;

  let sizeW = 0, sizeH = 0, previousMood = -1;
  const wrap = (value, length) => ((value % length) + length) % length;
  function update(state) {
    const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight);
    if (width !== sizeW || height !== sizeH) {
      sizeW = width; sizeH = height;
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    }
    const mood = state.scene === 'night' ? 2 : state.scene === 'day' ? 1 : 0;
    if (mood !== previousMood) {
      skyMaterial.uniforms.uMood.value = mood;
      scene.fog.color.setHex(mood === 2 ? 0x31394f : mood === 1 ? 0xa5b9b9 : 0xaf796f);
      hemi.intensity = mood === 2 ? .65 : 2.0;
      sunLight.intensity = mood === 2 ? .35 : 2.8;
      renderer.toneMappingExposure = mood === 2 ? 1.12 : 1.34;
      previousMood = mood;
    }
    skyMaterial.uniforms.uTime.value = state.time;
    asphalt.color.setHex(state.surface === 'wet' ? 0x242a30 : 0x352a2b);
    asphalt.roughness = state.surface === 'wet' ? .27 : .9;
    const travel = state.phase === 'ready' ? state.time * 3 : state.distance;
    for (const { mesh, i } of dashMarks) mesh.position.z = 10 - wrap(i * 6 - travel, 492);
    for (const { group, i } of lampGroups) group.position.z = 14 - wrap(i * 33 - travel, 957);
    const remain = state.totalDistance - state.distance;
    barrier.visible = remain > 0 && remain < 440;
    if (barrier.visible) barrier.position.z = -6.4 - remain;
    if (state.phase === 'failed' && state.cause === 'pedal') {
      car.rotation.z = Math.min(.35, car.rotation.z + .018);
      car.rotation.x = Math.min(.24, car.rotation.x + .011);
    } else { car.rotation.z *= .88; car.rotation.x *= .88; }
    const speedRatio = Math.min(1, state.speed / 260);
    car.position.y = Math.sin(state.distance * .12) * .008 * speedRatio;
    for (const wheel of wheels) wheel.rotation.x = -state.distance / .45;
    redLamp.emissiveIntensity = state.phase === 'braking' ? 3.6 : 1.75;
    const mobile = width < 620;
    const sunset = mood === 0 ? sunsetBackgrounds[mobile ? 'portrait' : 'wide'] : null;
    scene.background = sunset;
    sky.visible = !sunset;
    for (const mountain of mountainMeshes) mountain.visible = !sunset;
    if (carSprite) {
      const spriteWidth = mobile ? 6.2 : 8.1;
      carSprite.scale.set(spriteWidth, spriteWidth * 941 / 1672, 1);
      carSprite.position.x = mobile ? 1.25 : -3.1;
      carSprite.position.y = (mobile ? 1.50 : 1.76) + car.position.y;
      carShadow.position.x = carSprite.position.x;
      carSprite.material.color.setHex(mood === 2 ? 0x777a8a : mood === 1 ? 0xffffff : 0xfff0de);
      carSprite.material.rotation = state.phase === 'failed' && state.cause === 'pedal' ? -.15 : 0;
    }
    const camX = mobile ? 1.9 : 3.3;
    const camY = mobile ? 2.85 : 2.7;
    camera.position.set(camX + Math.sin(state.distance * .04) * .025 * speedRatio, camY, mobile ? 5.7 : 5.5);
    camera.lookAt(mobile ? -1.7 : -.55, mobile ? .65 : 1.0, mobile ? -28 : -29);
    camera.fov = (mobile ? 67 : 59) + speedRatio * 2.5;
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }
  renderer.domElement.addEventListener('webglcontextlost', () => {
    document.body.classList.remove('drive-ready');
    document.body.classList.add('drive-fallback');
  });
  window.BrakeLabVisual = { update };
  update({ phase: 'ready', distance: 0, speed: 0, force: 0, scene: 'dusk', surface: 'dry', totalDistance: 2597, time: 0 });
  document.body.classList.add('drive-ready');
} catch (error) {
  console.warn('3D scene unavailable; using Canvas fallback.', error);
  document.body.classList.add('drive-fallback');
}
