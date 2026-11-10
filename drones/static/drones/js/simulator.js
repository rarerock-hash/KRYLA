
import * as THREE from 'https://esm.sh/three@0.160.1';
import { GLTFLoader } from 'https://esm.sh/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';

// ========================================================
// KRYLA — CINEMATIC ULTRA
// High-detail procedural world + Mavic flight simulation
// ========================================================

const $ = id => document.getElementById(id);
const canvas = $('flight-canvas');
const frame = canvas.parentElement;

if (!canvas) throw new Error('KRYLA: flight canvas missing');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
});

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const clock = new THREE.Clock();
const UP = new THREE.Vector3(0, 1, 0);
const keys = new Set();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

const settings = {
    time: 'sunset',
    speed: 'normal',
    lighting: 'navigation',
    rain: false,
    wind: true,
    fog: 20,
    stars: true,
    moon: true,
    particles: true,
    sound: true
};

const state = {
    flying: false,
    heading: 0,
    velocity: new THREE.Vector3(),
    verticalSpeed: 0,
    cameraMode: 0,
    photo: false,
    elapsed: 0,
    modelLoaded: false
};

// ========================================================
// SKY — ATMOSPHERIC SHADER
// ========================================================

const skyUniforms = {
    topColor: { value: new THREE.Color('#294e7d') },
    horizonColor: { value: new THREE.Color('#f7aa78') },
    sunColor: { value: new THREE.Color('#ffd6a2') },
    sunDirection: {
        value: new THREE.Vector3(-0.55, 0.22, -0.8).normalize()
    },
    night: { value: 0 }
};

const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 48, 32),
    new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: skyUniforms,
        vertexShader: `
            varying vec3 vDirection;

            void main() {
                vDirection = normalize(position);

                gl_Position = projectionMatrix *
                    modelViewMatrix *
                    vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vDirection;

            uniform vec3 topColor;
            uniform vec3 horizonColor;
            uniform vec3 sunColor;
            uniform vec3 sunDirection;
            uniform float night;

            void main() {
                vec3 dir = normalize(vDirection);

                float elevation = max(dir.y, 0.0);
                float blend = pow(elevation, 0.55);

                vec3 color = mix(
                    horizonColor,
                    topColor,
                    blend
                );

                float sunAmount = max(
                    dot(dir, normalize(sunDirection)),
                    0.0
                );

                float halo = pow(sunAmount, 22.0);
                float broadGlow = pow(sunAmount, 4.0);

                color += sunColor *
                    (halo * 0.55 + broadGlow * 0.13) *
                    (1.0 - night);

                float horizonMist =
                    exp(-abs(dir.y) * 15.0);

                color = mix(
                    color,
                    horizonColor,
                    horizonMist * 0.18
                );

                gl_FragColor = vec4(color, 1.0);
            }
        `
    })
);

scene.add(skyDome);
scene.fog = new THREE.FogExp2('#e6aa86', 0.0021);

// ========================================================
// LIGHTING
// ========================================================

const hemisphere = new THREE.HemisphereLight(
    0xc8e0ff, 0x384c32, 1.45
);
scene.add(hemisphere);

const sunLight = new THREE.DirectionalLight(
    0xffcb91, 3.6
);

sunLight.position.set(-220, 125, -330);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.left = -160;
sunLight.shadow.camera.right = 160;
sunLight.shadow.camera.top = 160;
sunLight.shadow.camera.bottom = -160;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 900;
sunLight.shadow.bias = -0.0003;
sunLight.shadow.normalBias = 0.035;
sunLight.shadow.radius = 2;

scene.add(sunLight, sunLight.target);

const moonLight = new THREE.DirectionalLight(
    0x9cbcff, 0
);
moonLight.position.set(190, 250, -260);
scene.add(moonLight);

// ========================================================
// GLOW TEXTURE
// ========================================================

function createGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;

    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(
        64, 64, 0, 64, 64, 64
    );

    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,.75)');
    g.addColorStop(0.4, 'rgba(255,255,255,.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);

    return new THREE.CanvasTexture(c);
}

const glowMap = createGlowTexture();

function glow(color, size, opacity = 1) {
    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: glowMap,
            color,
            opacity,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        })
    );

    sprite.scale.set(size, size, 1);
    return sprite;
}

// ========================================================
// SUN / MOON
// ========================================================

const sun = new THREE.Mesh(
    new THREE.SphereGeometry(24, 48, 32),
    new THREE.MeshBasicMaterial({
        color: '#ffe2a6',
        fog: false,
        toneMapped: false
    })
);
scene.add(sun);

const sunGlow = glow(0xffa958, 210, 0.8);
scene.add(sunGlow);

const moon = new THREE.Mesh(
    new THREE.SphereGeometry(16, 32, 24),
    new THREE.MeshBasicMaterial({
        color: '#dfeaff',
        fog: false,
        toneMapped: false
    })
);
scene.add(moon);

const moonGlow = glow(0x91b8ff, 115, 0.55);
scene.add(moonGlow);

// ========================================================
// STARS
// ========================================================

const starCount = 3200;
const starPositions = new Float32Array(starCount * 3);

for (let i = 0; i < starCount; i++) {
    const angle = rand(0, Math.PI * 2);
    const elevation = rand(0.05, Math.PI / 2);
    const radius = 1100;

    starPositions[i * 3] =
        Math.cos(angle) * Math.cos(elevation) * radius;

    starPositions[i * 3 + 1] =
        Math.sin(elevation) * radius;

    starPositions[i * 3 + 2] =
        Math.sin(angle) * Math.cos(elevation) * radius;
}

const starsGeometry = new THREE.BufferGeometry();
starsGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(starPositions, 3)
);

const stars = new THREE.Points(
    starsGeometry,
    new THREE.PointsMaterial({
        color: 0xe7f0ff,
        size: 1.9,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
        fog: false,
        depthWrite: false
    })
);
scene.add(stars);

// ========================================================
// PROCEDURAL NOISE
// ========================================================

function hash(x, z) {
    const value = Math.sin(
        x * 127.1 + z * 311.7
    ) * 43758.5453;

    return value - Math.floor(value);
}

function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);

    const fx = x - ix;
    const fz = z - iz;

    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);

    return lerp(
        lerp(
            hash(ix, iz),
            hash(ix + 1, iz),
            u
        ),
        lerp(
            hash(ix, iz + 1),
            hash(ix + 1, iz + 1),
            u
        ),
        v
    );
}

function fbm(x, z) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;

    for (let i = 0; i < 5; i++) {
        value += noise(
            x * frequency,
            z * frequency
        ) * amplitude;

        frequency *= 2.05;
        amplitude *= 0.5;
    }

    return value;
}

// ========================================================
// TERRAIN — MULTI-LAYERED MOUNTAINS
// ========================================================

const lakeX = -115;
const lakeZ = -145;
const lakeRadius = 67;

function terrainHeight(x, z) {
    const distance = Math.hypot(x, z);

    const base =
        Math.sin(x * 0.012) * 7 +
        Math.cos(z * 0.013) * 8 +
        Math.sin((x + z) * 0.023) * 4;

    const broad = (fbm(
        x * 0.006,
        z * 0.006
    ) - 0.48) * 80;

    const ridges =
        Math.pow(
            Math.abs(
                Math.sin(x * 0.007 + z * 0.004)
            ),
            1.8
        ) * 35;

    const detail = (
        fbm(x * 0.06, z * 0.06) - 0.5
    ) * 5;

    const mountainFactor = smooth(
        distance, 75, 350
    );

    const height =
        base +
        broad * mountainFactor +
        ridges * mountainFactor +
        detail;

    const clearing = smooth(
        distance, 10, 55
    );

    const lakeDistance = Math.hypot(
        x - lakeX,
        z - lakeZ
    );

    const shoreBlend = smooth(
        lakeDistance,
        lakeRadius - 10,
        lakeRadius + 17
    );

    return lerp(
        -3.6,
        height * clearing,
        shoreBlend
    );
}

const terrainGeometry = new THREE.PlaneGeometry(
    1600, 1600, 260, 260
);
terrainGeometry.rotateX(-Math.PI / 2);

const terrainPosition =
    terrainGeometry.attributes.position;

const terrainColors = [];

const forestColor = new THREE.Color('#365b3b');
const meadowColor = new THREE.Color('#74975c');
const dryColor = new THREE.Color('#b7a477');
const stoneColor = new THREE.Color('#777d78');
const snowColor = new THREE.Color('#c5c8bd');

for (let i = 0; i < terrainPosition.count; i++) {
    const x = terrainPosition.getX(i);
    const z = terrainPosition.getZ(i);
    const y = terrainHeight(x, z);

    terrainPosition.setY(i, y);

    const variation = fbm(
        x * 0.12, z * 0.12
    );

    const color = forestColor.clone().lerp(
        meadowColor,
        clamp(variation * 1.2, 0, 1)
    );

    if (y > 18) {
        color.lerp(
            stoneColor,
            smooth(y, 18, 58) * 0.85
        );
    }

    if (y > 65) {
        color.lerp(
            snowColor,
            smooth(y, 65, 110) * 0.65
        );
    }

    const lakeDistance = Math.hypot(
        x - lakeX, z - lakeZ
    );

    if (lakeDistance < lakeRadius + 13) {
        color.lerp(dryColor, 0.7);
    }

    terrainColors.push(
        color.r, color.g, color.b
    );
}

terrainGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
        terrainColors, 3
    )
);
terrainGeometry.computeVertexNormals();

const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98
});

// Add small-scale surface variation in the material shader.
terrainMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>

        float textureDetail =
            sin(vViewPosition.x * 3.7) *
            cos(vViewPosition.z * 4.1);

        diffuseColor.rgb *=
            0.96 + textureDetail * 0.035;
        `
    );
};

const terrain = new THREE.Mesh(
    terrainGeometry,
    terrainMaterial
);

terrain.receiveShadow = true;
scene.add(terrain);

// ========================================================
// DISTANT MOUNTAIN SILHOUETTES
// ========================================================

const mountainMaterial = new THREE.MeshStandardMaterial({
    color: '#62746b',
    roughness: 1,
    flatShading: true
});

for (let i = 0; i < 35; i++) {
    const angle = i / 35 * Math.PI * 2;
    const distance = rand(720, 950);
    const height = rand(80, 190);
    const radius = rand(55, 125);

    const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(
            radius,
            height,
            5
        ),
        mountainMaterial
    );

    mountain.position.set(
        Math.cos(angle) * distance,
        height * 0.42 - 25,
        Math.sin(angle) * distance
    );

    mountain.rotation.y = rand(0, Math.PI);
    scene.add(mountain);
}

// ========================================================
// LAKE — ANIMATED REFLECTIVE SURFACE
// ========================================================

const waterGeometry = new THREE.CircleGeometry(
    lakeRadius, 160
);
waterGeometry.rotateX(-Math.PI / 2);

const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,

    uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uRain: { value: 0 },
        uSun: {
            value: new THREE.Vector3(
                -0.55, 0.35, -0.8
            )
        }
    },

    vertexShader: `
        varying vec3 vWorld;
        varying vec2 vUv;

        uniform float uTime;

        void main() {
            vUv = uv;

            vec3 p = position;

            p.y +=
                sin(p.x * 0.24 + uTime * 1.2) * 0.12 +
                cos(p.z * 0.31 - uTime * 0.9) * 0.10 +
                sin((p.x + p.z) * 0.51 + uTime) * 0.035;

            vec4 world = modelMatrix * vec4(p, 1.0);
            vWorld = world.xyz;

            gl_Position =
                projectionMatrix * viewMatrix * world;
        }
    `,

    fragmentShader: `
        varying vec3 vWorld;
        varying vec2 vUv;

        uniform float uTime;
        uniform float uNight;
        uniform float uRain;
        uniform vec3 uSun;

        void main() {
            float wave =
                sin(vWorld.x * 0.26 + uTime * 1.3) *
                cos(vWorld.z * 0.29 - uTime);

            float smallWaves =
                sin(vWorld.x * 1.1 + uTime * 2.8) *
                cos(vWorld.z * 0.9 - uTime * 1.7);

            vec3 normal = normalize(vec3(
                cos(vWorld.x * 0.26 + uTime * 1.3) * 0.22,
                1.0,
                sin(vWorld.z * 0.29 - uTime) * 0.20
            ));

            vec3 viewDir = normalize(
                cameraPosition - vWorld
            );

            vec3 lightDir = normalize(uSun);

            float highlight = pow(
                max(
                    dot(
                        reflect(-lightDir, normal),
                        viewDir
                    ),
                    0.0
                ),
                38.0
            );

            float fresnel = pow(
                1.0 -
                max(dot(viewDir, normal), 0.0),
                3.0
            );

            vec3 waterDay = mix(
                vec3(0.035, 0.22, 0.27),
                vec3(0.17, 0.46, 0.49),
                wave * 0.5 + 0.5
            );

            vec3 waterNight = mix(
                vec3(0.012, 0.04, 0.08),
                vec3(0.035, 0.11, 0.20),
                wave * 0.5 + 0.5
            );

            vec3 color = mix(
                waterDay,
                waterNight,
                uNight
            );

            vec3 reflection = mix(
                vec3(1.0, 0.64, 0.28),
                vec3(0.65, 0.78, 1.0),
                uNight
            );

            color += reflection * highlight * 0.9;
            color += reflection * fresnel * 0.12;

            color += smallWaves * 0.018;

            float rainRipple =
                sin(
                    length(vWorld.xz) * 6.0 -
                    uTime * 10.0
                );

            color += uRain * rainRipple * 0.025;

            gl_FragColor = vec4(color, 0.97);
        }
    `
});

const lake = new THREE.Mesh(
    waterGeometry,
    waterMaterial
);
lake.position.set(lakeX, -1.7, lakeZ);
scene.add(lake);

const shoreline = new THREE.Mesh(
    new THREE.RingGeometry(
        lakeRadius - 0.8,
        lakeRadius + 3,
        160
    ),
    new THREE.MeshStandardMaterial({
        color: '#b9ad88',
        roughness: 1,
        side: THREE.DoubleSide
    })
);

shoreline.rotation.x = -Math.PI / 2;
shoreline.position.set(lakeX, -1.72, lakeZ);
scene.add(shoreline);

// ========================================================
// FOREST — MULTIPLE TREE TYPES
// ========================================================

const dummy = new THREE.Object3D();

const treeTypes = [
    {
        count: 1100,
        radius: 1.45,
        height: 6.2,
        color: '#31563b'
    },
    {
        count: 750,
        radius: 1.8,
        height: 7.8,
        color: '#456d43'
    },
    {
        count: 450,
        radius: 2.0,
        height: 5.8,
        color: '#5c7546'
    }
];

const forestMeshes = [];

for (const type of treeTypes) {
    const crownGeometry = new THREE.ConeGeometry(
        type.radius,
        type.height,
        7
    );

    const crownMaterial = new THREE.MeshStandardMaterial({
        color: type.color,
        roughness: 0.94,
        flatShading: true
    });

    const crown = new THREE.InstancedMesh(
        crownGeometry,
        crownMaterial,
        type.count
    );

    const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(
            0.13, 0.24, 2.5, 6
        ),
        new THREE.MeshStandardMaterial({
            color: '#594735'
        }),
        type.count
    );

    crown.castShadow = true;
    trunk.castShadow = true;

    for (let i = 0; i < type.count; i++) {
        let x, z, y;

        do {
            x = rand(-550, 550);
            z = rand(-550, 550);
            y = terrainHeight(x, z);
        } while (
            Math.hypot(x, z) < 32 ||
            Math.hypot(
                x - lakeX,
                z - lakeZ
            ) < lakeRadius + 7 ||
            y > 62
        );

        const scale = rand(0.75, 2.3);

        dummy.position.set(
            x,
            y + type.height * scale * 0.48 + 1.3,
            z
        );

        dummy.scale.setScalar(scale);
        dummy.rotation.set(
            0, rand(0, Math.PI * 2), 0
        );
        dummy.updateMatrix();

        crown.setMatrixAt(i, dummy.matrix);

        crown.setColorAt(
            i,
            new THREE.Color().setHSL(
                rand(0.25, 0.38),
                rand(0.2, 0.42),
                rand(0.22, 0.4)
            )
        );

        dummy.position.y = y + 1.25 * scale;
        dummy.updateMatrix();

        trunk.setMatrixAt(i, dummy.matrix);
    }

    scene.add(crown, trunk);
    forestMeshes.push(crown, trunk);
}

// ========================================================
// UNDERGROWTH
// ========================================================

const grassCount = 16000;

const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.12, 0.72, 3),
    new THREE.MeshStandardMaterial({
        color: '#88a96a',
        side: THREE.DoubleSide,
        roughness: 1
    }),
    grassCount
);

for (let i = 0; i < grassCount; i++) {
    let x, z, y;

    do {
        x = rand(-350, 350);
        z = rand(-350, 350);
        y = terrainHeight(x, z);
    } while (
        Math.hypot(
            x - lakeX,
            z - lakeZ
        ) < lakeRadius + 4 ||
        y > 65
    );

    const scale = rand(0.4, 1.8);

    dummy.position.set(
        x,
        y + 0.25 * scale,
        z
    );

    dummy.scale.setScalar(scale);
    dummy.rotation.set(
        0, rand(0, Math.PI * 2), 0
    );
    dummy.updateMatrix();

    grass.setMatrixAt(i, dummy.matrix);
}

scene.add(grass);

// ========================================================
// ROCKS
// ========================================================

const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({
        color: '#858a80',
        roughness: 1,
        flatShading: true
    }),
    420
);

for (let i = 0; i < 420; i++) {
    const x = rand(-450, 450);
    const z = rand(-450, 450);
    const s = rand(0.4, 2.7);

    dummy.position.set(
        x,
        terrainHeight(x, z) + s * 0.1,
        z
    );

    dummy.scale.set(
        s * 1.3,
        s * 0.55,
        s
    );

    dummy.rotation.set(
        rand(0, 1),
        rand(0, Math.PI * 2),
        rand(0, 0.3)
    );

    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
}

scene.add(rocks);

// ========================================================
// CLOUD LAYERS
// ========================================================

const clouds = [];

const cloudMaterial = new THREE.MeshLambertMaterial({
    color: '#ffe6d0',
    transparent: true,
    opacity: 0.68,
    depthWrite: false
});

const cloudGeometry = new THREE.SphereGeometry(
    1, 12, 9
);

for (let i = 0; i < 35; i++) {
    const group = new THREE.Group();

    for (let j = 0; j < 7; j++) {
        const puff = new THREE.Mesh(
            cloudGeometry,
            cloudMaterial
        );

        puff.position.set(
            j * 9 - 27,
            rand(-3, 4),
            rand(-8, 8)
        );

        puff.scale.set(
            rand(11, 21),
            rand(4, 8),
            rand(8, 15)
        );

        group.add(puff);
    }

    group.position.set(
        rand(-700, 700),
        rand(115, 230),
        rand(-700, 700)
    );

    scene.add(group);
    clouds.push(group);
}

// ========================================================
// LANDING PAD
// ========================================================

const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.35, 64),
    new THREE.MeshStandardMaterial({
        color: '#29332f',
        metalness: 0.3,
        roughness: 0.65
    })
);

pad.position.y = 0.05;
pad.receiveShadow = true;
scene.add(pad);

const padRing = new THREE.Mesh(
    new THREE.RingGeometry(5.8, 6.15, 64),
    new THREE.MeshBasicMaterial({
        color: '#c8e596',
        side: THREE.DoubleSide
    })
);

padRing.rotation.x = -Math.PI / 2;
padRing.position.y = 0.24;
scene.add(padRing);

for (const angle of [0, Math.PI / 2]) {
    const line = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.035, 0.65),
        new THREE.MeshBasicMaterial({
            color: '#e3ebda'
        })
    );

    line.position.y = 0.26;
    line.rotation.y = angle;
    scene.add(line);
}

// ========================================================
// MAVIC — REAL GLB MODEL
// ========================================================

const drone = new THREE.Group();
scene.add(drone);

const body = new THREE.Group();
drone.add(body);

const modelHolder = new THREE.Group();
body.add(modelHolder);

const fallback = new THREE.Group();
body.add(fallback);

const fallbackMaterial = new THREE.MeshStandardMaterial({
    color: '#53675f',
    metalness: 0.55,
    roughness: 0.35
});

const fallbackDark = new THREE.MeshStandardMaterial({
    color: '#1b2729',
    metalness: 0.55,
    roughness: 0.35
});

function addPart(geometry, material, parent, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);

    return mesh;
}

addPart(
    new THREE.BoxGeometry(2, 0.55, 2.8),
    fallbackMaterial,
    fallback, 0, 0, 0
);

const fallbackRotors = [];

for (const x of [-2.2, 2.2]) {
    for (const z of [-2.2, 2.2]) {
        const arm = addPart(
            new THREE.BoxGeometry(0.22, 0.18, 3),
            fallbackDark,
            fallback,
            x / 2, 0.1, z / 2
        );

        arm.rotation.y = Math.atan2(x, z);

        const rotor = new THREE.Group();
        rotor.position.set(x, 0.35, z);
        fallback.add(rotor);

        addPart(
            new THREE.BoxGeometry(2.5, 0.04, 0.16),
            fallbackDark,
            rotor, 0, 0, 0
        );

        fallbackRotors.push(rotor);
    }
}

const droneSize = {
    width: 5.3,
    length: 5.3,
    height: 1.5
};

const modelRotors = [];

new GLTFLoader().load(
    new URL(
        '../models/wm260_glb_0909.glb',
        import.meta.url
    ).href,

    gltf => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());

        if (Math.max(size.x, size.z) <= 0) {
            console.error('KRYLA: invalid Mavic model');
            return;
        }

        const scale = 5.3 / Math.max(size.x, size.z);

        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3()
            .setFromObject(model);

        const center = scaledBox.getCenter(
            new THREE.Vector3()
        );

        model.position.sub(center);
        model.updateMatrixWorld(true);

        const finalSize = new THREE.Box3()
            .setFromObject(model)
            .getSize(new THREE.Vector3());

        droneSize.width = finalSize.x;
        droneSize.length = finalSize.z;
        droneSize.height = finalSize.y;

        model.traverse(object => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }

            if (/^桨叶[1-4]$/.test(object.name)) {
                modelRotors.push(object);
            }
        });

        modelHolder.add(model);
        fallback.visible = false;
        state.modelLoaded = true;

        console.log(
            'KRYLA: Mavic loaded',
            finalSize,
            'Rotors:',
            modelRotors.length
        );
    },

    undefined,

    error => {
        console.error('KRYLA GLB error:', error);
        fallback.visible = true;
    }
);

// ========================================================
// DRONE LIGHTS
// ========================================================

const navLights = [];
const navHalos = [];

const navColors = [
    0xff3434,
    0x36ff8a,
    0xff3434,
    0x36ff8a
];

for (let i = 0; i < 4; i++) {
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 10),
        new THREE.MeshBasicMaterial({
            color: navColors[i],
            toneMapped: false
        })
    );

    const halo = glow(navColors[i], 0.85, 0.7);

    bulb.userData.side = i % 2 === 0 ? -1 : 1;
    bulb.userData.front = i < 2 ? -1 : 1;

    body.add(bulb, halo);

    navLights.push(bulb);
    navHalos.push(halo);
}

const strobe = new THREE.PointLight(
    0xe7f1ff, 0, 12, 2
);
strobe.position.y = 0.7;
body.add(strobe);

const undersideLight = new THREE.PointLight(
    0x90bfff, 0, 14, 2
);
undersideLight.position.y = -0.4;
body.add(undersideLight);

const spotlight = new THREE.SpotLight(
    0xeaf2ff, 0, 70,
    Math.PI / 7, 0.5, 1.5
);

spotlight.position.set(0, -0.4, 0);
spotlight.target.position.set(0, -20, 0);

body.add(spotlight, spotlight.target);

function updateDroneLights() {
    const night = settings.time === 'night';
    const enabled = settings.lighting !== 'off';
    const cinematic = settings.lighting === 'cinematic';

    const width = droneSize.width * 0.29;
    const length = droneSize.length * 0.29;

    navLights.forEach((bulb, i) => {
        bulb.position.set(
            bulb.userData.side * width,
            0.04,
            bulb.userData.front * length
        );

        navHalos[i].position.copy(bulb.position);

        const color = cinematic
            ? 0x75c9ff
            : navColors[i];

        bulb.material.color.setHex(
            enabled ? color : 0x252b2c
        );

        navHalos[i].material.color.setHex(color);
        navHalos[i].visible =
            enabled && (night || cinematic);

        navHalos[i].material.opacity =
            night ? 0.8 : 0.4;
    });

    strobe.intensity =
        enabled &&
        night &&
        Math.sin(state.elapsed * 9) > 0.65
            ? 3.5
            : 0;

    undersideLight.intensity =
        enabled && night
            ? cinematic ? 3 : 1.3
            : 0;

    spotlight.intensity =
        enabled && night ? 3 : 0;
}

// ========================================================
// RAIN
// ========================================================

const rainCount = 2000;
const rainPositions = new Float32Array(rainCount * 3);

for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3] = rand(-65, 65);
    rainPositions[i * 3 + 1] = rand(-15, 80);
    rainPositions[i * 3 + 2] = rand(-65, 65);
}

const rainGeometry = new THREE.BufferGeometry();
rainGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(rainPositions, 3)
);

const rain = new THREE.Points(
    rainGeometry,
    new THREE.PointsMaterial({
        color: '#c5dff4',
        size: 0.19,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
    })
);

scene.add(rain);

// ========================================================
// FIREFLIES
// ========================================================

const fireflyCount = 250;
const fireflyPositions = new Float32Array(
    fireflyCount * 3
);

for (let i = 0; i < fireflyCount; i++) {
    const x = rand(-150, 150);
    const z = rand(-150, 150);

    fireflyPositions[i * 3] = x;
    fireflyPositions[i * 3 + 1] =
        terrainHeight(x, z) + rand(1, 8);
    fireflyPositions[i * 3 + 2] = z;
}

const fireflyGeometry = new THREE.BufferGeometry();
fireflyGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
        fireflyPositions, 3
    )
);

const fireflies = new THREE.Points(
    fireflyGeometry,
    new THREE.PointsMaterial({
        color: '#f6e9a0',
        size: 0.7,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    })
);

scene.add(fireflies);

// ========================================================
// AUDIO
// ========================================================

let audioContext;
let motorA;
let motorB;
let motorGain;
let motorFilter;
let windGain;

function initAudio() {
    if (audioContext) {
        audioContext.resume();
        return;
    }

    const AudioClass =
        window.AudioContext ||
        window.webkitAudioContext;

    if (!AudioClass) return;

    audioContext = new AudioClass();

    motorA = audioContext.createOscillator();
    motorB = audioContext.createOscillator();

    motorA.type = 'sawtooth';
    motorB.type = 'triangle';

    motorFilter = audioContext.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 900;

    motorGain = audioContext.createGain();
    motorGain.gain.value = 0;

    motorA.connect(motorFilter);
    motorB.connect(motorFilter);
    motorFilter.connect(motorGain);
    motorGain.connect(audioContext.destination);

    motorA.start();
    motorB.start();

    const buffer = audioContext.createBuffer(
        1,
        audioContext.sampleRate * 2,
        audioContext.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    windGain = audioContext.createGain();
    windGain.gain.value = 0;

    noise.connect(filter);
    filter.connect(windGain);
    windGain.connect(audioContext.destination);

    noise.start();
}

function updateAudio() {
    if (!audioContext) return;

    const t = audioContext.currentTime;
    const speed = state.velocity.length();
    const active = state.flying && settings.sound;

    motorA.frequency.setTargetAtTime(
        active ? 92 + speed * 3.2 : 65,
        t, 0.08
    );

    motorB.frequency.setTargetAtTime(
        active ? 186 + speed * 5.5 : 130,
        t, 0.08
    );

    motorFilter.frequency.setTargetAtTime(
        500 + speed * 28,
        t, 0.1
    );

    motorGain.gain.setTargetAtTime(
        active
            ? Math.min(0.085, 0.035 + speed * 0.0015)
            : 0,
        t, 0.15
    );

    windGain.gain.setTargetAtTime(
        active && settings.wind
            ? Math.min(0.038, 0.007 + speed * 0.0008)
            : 0,
        t, 0.2
    );
}

// ========================================================
// TIME PRESETS
// ========================================================

const presets = {
    day: {
        top: '#3275b1',
        horizon: '#b9e1ed',
        fog: '#b7d4d6',
        sunColor: '#fff3d0',
        sun: 3.4,
        ambient: 1.8,
        moon: 0,
        exposure: 1.17,
        sunPosition: [-190, 290, -280],
        cloud: '#ffffff'
    },

    sunset: {
        top: '#294e7d',
        horizon: '#f7aa78',
        fog: '#e1ae8c',
        sunColor: '#ffd09a',
        sun: 3.7,
        ambient: 1.2,
        moon: 0,
        exposure: 1.11,
        sunPosition: [-220, 125, -330],
        cloud: '#ffe0bd'
    },

    night: {
        top: '#030a19',
        horizon: '#172944',
        fog: '#162b3c',
        sunColor: '#1a2940',
        sun: 0.02,
        ambient: 0.2,
        moon: 1.7,
        exposure: 0.98,
        sunPosition: [-190, -130, -330],
        cloud: '#485875'
    }
};

const tempColor = new THREE.Color();
const tempSun = new THREE.Vector3();

function updateEnvironment(dt) {
    const preset = presets[settings.time];
    const blend = Math.min(1, dt * 1.5);
    const night = settings.time === 'night';

    tempColor.set(preset.top);
    skyUniforms.topColor.value.lerp(tempColor, blend);

    tempColor.set(preset.horizon);
    skyUniforms.horizonColor.value.lerp(
        tempColor, blend
    );

    tempColor.set(preset.sunColor);
    skyUniforms.sunColor.value.lerp(
        tempColor, blend
    );

    skyUniforms.night.value = lerp(
        skyUniforms.night.value,
        night ? 1 : 0,
        blend
    );

    tempColor.set(preset.fog);
    scene.fog.color.lerp(tempColor, blend);

    const density =
        0.0005 +
        Math.pow(settings.fog / 100, 1.7) * 0.021;

    scene.fog.density = lerp(
        scene.fog.density,
        density,
        blend
    );

    sunLight.intensity = lerp(
        sunLight.intensity,
        preset.sun,
        blend
    );

    hemisphere.intensity = lerp(
        hemisphere.intensity,
        preset.ambient,
        blend
    );

    moonLight.intensity = lerp(
        moonLight.intensity,
        settings.moon ? preset.moon : 0,
        blend
    );

    renderer.toneMappingExposure = lerp(
        renderer.toneMappingExposure,
        preset.exposure,
        blend
    );

    tempSun.set(...preset.sunPosition);
    sunLight.position.lerp(tempSun, blend);

    skyUniforms.sunDirection.value
        .copy(sunLight.position)
        .normalize();

    sunLight.target.position.copy(drone.position);
    sunLight.target.updateMatrixWorld();

    sun.position
        .copy(sunLight.position)
        .normalize()
        .multiplyScalar(1050);

    sunGlow.position.copy(sun.position);

    sun.visible = !night;
    sunGlow.visible = !night;

    moon.position.set(420, 520, -720);
    moonGlow.position.copy(moon.position);

    moon.visible = night && settings.moon;
    moonGlow.visible = night && settings.moon;

    stars.visible = night && settings.stars;
    fireflies.visible = night && settings.particles;
    rain.visible = settings.rain;

    tempColor.set(preset.cloud);
    cloudMaterial.color.lerp(tempColor, blend);

    waterMaterial.uniforms.uNight.value = lerp(
        waterMaterial.uniforms.uNight.value,
        night ? 1 : 0,
        blend
    );

    waterMaterial.uniforms.uRain.value =
        settings.rain ? 1 : 0;

    waterMaterial.uniforms.uSun.value
        .copy(
            night
                ? moonLight.position
                : sunLight.position
        )
        .normalize();

    if ($('environment-status')) {
        $('environment-status').textContent =
            night
                ? '☾ NIGHT OPS'
                : settings.time === 'day'
                    ? '☀ DAYLIGHT'
                    : '☀ GOLDEN HOUR';
    }
}

// ========================================================
// FLIGHT PHYSICS
// ========================================================

const speedModes = {
    cinematic: 9,
    normal: 19,
    sport: 36
};

const movement = new THREE.Vector3();
const localVelocity = new THREE.Vector3();

function resetDrone() {
    drone.position.set(0, 2.8, 0);
    state.velocity.set(0, 0, 0);
    state.verticalSpeed = 0;
    state.heading = 0;

    drone.rotation.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
}

function updateFlight(dt) {
    const active = state.flying;

    const forward =
        (keys.has('KeyW') ? 1 : 0) -
        (keys.has('KeyS') ? 1 : 0);

    const strafe =
        (keys.has('KeyD') ? 1 : 0) -
        (keys.has('KeyA') ? 1 : 0);

    const turn =
        (keys.has('KeyE') ? 1 : 0) -
        (keys.has('KeyQ') ? 1 : 0);

    const vertical =
        (keys.has('Space') ? 1 : 0) -
        (
            keys.has('ShiftLeft') ||
            keys.has('ShiftRight')
                ? 1
                : 0
        );

    if (active) {
        state.heading -=
            turn * dt *
            (settings.speed === 'sport' ? 2 : 1.45);
    }

    drone.rotation.y = state.heading;

    movement.set(strafe, 0, -forward);

    if (movement.lengthSq() > 1) {
        movement.normalize();
    }

    const speed = speedModes[settings.speed];

    movement
        .applyAxisAngle(UP, state.heading)
        .multiplyScalar(active ? speed : 0);

    if (active && settings.wind) {
        movement.x +=
            1.1 +
            Math.sin(state.elapsed * 0.75) * 1.4;

        movement.z +=
            Math.cos(state.elapsed * 0.55);
    }

    const smoothing = 1 - Math.exp(-dt * 2.8);

    state.velocity.lerp(movement, smoothing);

    state.verticalSpeed = lerp(
        state.verticalSpeed,
        active ? vertical * speed * 0.62 : 0,
        smoothing
    );

    drone.position.addScaledVector(
        state.velocity, dt
    );

    drone.position.y += state.verticalSpeed * dt;

    drone.position.x = clamp(
        drone.position.x, -650, 650
    );

    drone.position.z = clamp(
        drone.position.z, -650, 650
    );

    const lakeDistance = Math.hypot(
        drone.position.x - lakeX,
        drone.position.z - lakeZ
    );

    const floor = Math.max(
        terrainHeight(
            drone.position.x,
            drone.position.z
        ),
        lakeDistance < lakeRadius ? -1.4 : -100
    );

    drone.position.y = clamp(
        drone.position.y,
        floor + 1.9,
        300
    );

    localVelocity
        .copy(state.velocity)
        .applyAxisAngle(UP, -state.heading);

    body.rotation.x = lerp(
        body.rotation.x,
        clamp(
            localVelocity.z * 0.025,
            -0.35, 0.35
        ),
        smoothing
    );

    body.rotation.z = lerp(
        body.rotation.z,
        clamp(
            -localVelocity.x * 0.027,
            -0.35, 0.35
        ),
        smoothing
    );

    const rotationSpeed =
        dt *
        (
            active
                ? 43 + state.velocity.length() * 1.5
                : 2
        );

    modelRotors.forEach((rotor, i) => {
        rotor.rotation.y +=
            rotationSpeed * (i % 2 ? 1 : -1);
    });

    fallbackRotors.forEach((rotor, i) => {
        rotor.rotation.y +=
            rotationSpeed * (i % 2 ? 1 : -1);
    });
}

// ========================================================
// CAMERA
// ========================================================

const cameraTarget = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();

function updateCamera(dt) {
    const yaw = state.heading;

    if (state.photo) {
        const angle = state.elapsed * 0.17;

        cameraOffset.set(
            Math.sin(angle) * 17,
            6 + Math.sin(angle * 0.7) * 2,
            Math.cos(angle) * 17
        );

    } else if (state.cameraMode === 1) {
        cameraOffset.set(0, 30, 1);

    } else if (state.cameraMode === 2) {
        cameraOffset
            .set(0, 0.55, -1.15)
            .applyAxisAngle(UP, yaw);

    } else {
        cameraOffset
            .set(0, 6.4, 17)
            .applyAxisAngle(UP, yaw);
    }

    cameraTarget
        .copy(drone.position)
        .add(cameraOffset);

    camera.position.lerp(
        cameraTarget,
        Math.min(
            1,
            dt * (state.cameraMode === 2 ? 14 : 3.6)
        )
    );

    if (
        state.cameraMode === 2 &&
        !state.photo
    ) {
        cameraLook
            .set(0, 0, -28)
            .applyAxisAngle(UP, yaw)
            .add(drone.position);

    } else {
        cameraLook
            .copy(drone.position)
            .add(new THREE.Vector3(0, 0.3, 0));
    }

    camera.lookAt(cameraLook);

    body.visible =
        state.photo ||
        state.cameraMode !== 2;

    if ($('camera-status')) {
        $('camera-status').textContent =
            state.photo
                ? 'PHOTO MODE'
                : [
                    'CAM 01 · FOLLOW',
                    'CAM 02 · TOP',
                    'CAM 03 · FPV'
                ][state.cameraMode];
    }
}

function togglePhoto(force) {
    state.photo =
        typeof force === 'boolean'
            ? force
            : !state.photo;

    document.body.classList.toggle(
        'photo-mode',
        state.photo
    );

    onResize();
}

// ========================================================
// HUD
// ========================================================

function updateHUD() {
    const ground = terrainHeight(
        drone.position.x,
        drone.position.z
    );

    if ($('altitude')) {
        $('altitude').textContent =
            Math.max(
                0,
                drone.position.y - ground
            ).toFixed(1) + ' M';
    }

    if ($('speed')) {
        $('speed').textContent =
            (state.velocity.length() * 3.6)
                .toFixed(1) + ' KM/H';
    }

    if ($('heading')) {
        const degrees =
            (
                (
                    state.heading * 180 / Math.PI
                ) % 360 + 360
            ) % 360;

        $('heading').textContent =
            String(Math.round(degrees))
                .padStart(3, '0') + '°';
    }

    if ($('flight-status')) {
        $('flight-status').textContent =
            state.flying
                ? '● FLIGHT ACTIVE'
                : state.modelLoaded
                    ? '● MAVIC READY'
                    : '● SYSTEM STANDBY';
    }

    if ($('flight-message')) {
        $('flight-message').style.display =
            state.flying ? 'none' : '';
    }

    if ($('start-button')) {
        $('start-button').textContent =
            state.flying
                ? 'PAUSE FLIGHT ❚❚'
                : 'START FLIGHT →';
    }
}

// ========================================================
// UI
// ========================================================

$('start-button')?.addEventListener('click', () => {
    state.flying = !state.flying;

    if (state.flying) initAudio();

    updateHUD();
});

$('reset-button')?.addEventListener('click', () => {
    resetDrone();
    updateHUD();
});

$('photo-button')?.addEventListener(
    'click', () => togglePhoto(true)
);

$('photo-exit')?.addEventListener(
    'click', () => togglePhoto(false)
);

document.querySelectorAll('[data-time]').forEach(button => {
    button.addEventListener('click', () => {
        settings.time = button.dataset.time;

        document.querySelectorAll('[data-time]').forEach(b => {
            b.classList.toggle('active', b === button);
        });
    });
});

document.querySelectorAll('[data-speed]').forEach(button => {
    button.addEventListener('click', () => {
        settings.speed = button.dataset.speed;

        document.querySelectorAll('[data-speed]').forEach(b => {
            b.classList.toggle('active', b === button);
        });
    });
});

$('lighting-mode')?.addEventListener('change', event => {
    settings.lighting = event.target.value;
});

const toggles = [
    ['rain-toggle', 'rain'],
    ['wind-toggle', 'wind'],
    ['stars-toggle', 'stars'],
    ['moon-toggle', 'moon'],
    ['particles-toggle', 'particles'],
    ['sound-toggle', 'sound']
];

for (const [id, name] of toggles) {
    $(id)?.addEventListener('change', event => {
        settings[name] = event.target.checked;

        if (
            name === 'sound' &&
            settings.sound &&
            state.flying
        ) {
            initAudio();
        }
    });
}

$('fog-slider')?.addEventListener('input', event => {
    settings.fog = Number(event.target.value);

    if ($('fog-value')) {
        $('fog-value').textContent =
            settings.fog + '%';
    }
});

// ========================================================
// KEYBOARD
// ========================================================

window.addEventListener('keydown', event => {
    const flightKeys = [
        'KeyW', 'KeyA',
        'KeyS', 'KeyD',
        'KeyQ', 'KeyE',
        'Space',
        'ShiftLeft',
        'ShiftRight'
    ];

    if (flightKeys.includes(event.code)) {
        event.preventDefault();
    }

    if (event.repeat) return;

    keys.add(event.code);

    if (event.code === 'KeyC') {
        state.cameraMode =
            (state.cameraMode + 1) % 3;
    }

    if (event.code === 'KeyR') {
        resetDrone();
    }

    if (event.code === 'KeyP') {
        togglePhoto();
    }
});

window.addEventListener('keyup', event => {
    keys.delete(event.code);
});

window.addEventListener('blur', () => {
    keys.clear();
});

// ========================================================
// RESIZE
// ========================================================

function onResize() {
    const width = Math.max(1, frame.clientWidth);
    const height = Math.max(1, frame.clientHeight);

    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

window.addEventListener('resize', onResize);

if ('ResizeObserver' in window) {
    new ResizeObserver(onResize).observe(frame);
}

// ========================================================
// MAIN LOOP
// ========================================================

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);

    state.elapsed += dt;

    updateFlight(dt);
    updateEnvironment(dt);
    updateDroneLights();
    updateCamera(dt);
    updateAudio();
    updateHUD();

    waterMaterial.uniforms.uTime.value =
        state.elapsed;

    skyDome.position.copy(camera.position);

    clouds.forEach((cloud, i) => {
        cloud.position.x +=
            dt *
            (
                settings.wind
                    ? 1.5 + i * 0.05
                    : 0.2
            );

        if (cloud.position.x > 720) {
            cloud.position.x = -720;
        }
    });

    if (settings.rain) {
        const positions =
            rainGeometry.attributes.position;

        rain.position.copy(drone.position);

        for (let i = 0; i < rainCount; i++) {
            let y = positions.getY(i) - dt * 48;

            if (y < -15) y += 95;

            positions.setY(i, y);

            let x =
                positions.getX(i) +
                dt * (settings.wind ? 6 : 0);

            if (x > 65) x = -65;

            positions.setX(i, x);
        }

        positions.needsUpdate = true;
    }

    if (fireflies.visible) {
        fireflies.material.opacity =
            0.65 +
            Math.sin(state.elapsed * 2.5) * 0.22;
    }

    renderer.render(scene, camera);
}

// ========================================================
// START
// ========================================================

onResize();
resetDrone();

camera.position.set(0, 9, 19);

updateHUD();
animate();
