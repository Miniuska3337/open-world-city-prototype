import * as THREE from 'three';

export class Game {
  constructor(app) {
    this.app = app;
    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.messageTimer = 0;
    this.pointerLocked = false;
    this.now = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ab6e5);
    this.scene.fog = new THREE.Fog(0x7ab6e5, 90, 260);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 5, 18);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.app.appendChild(this.renderer.domElement);

    this.sun = new THREE.DirectionalLight(0xfff4d6, 1.6);
    this.sun.position.set(50, 90, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -140;
    this.sun.shadow.camera.right = 140;
    this.sun.shadow.camera.top = 140;
    this.sun.shadow.camera.bottom = -140;
    this.scene.add(this.sun);

    this.ambient = new THREE.HemisphereLight(0xdfefff, 0x243624, 0.9);
    this.scene.add(this.ambient);

    this.pickables = [];
    this.buildings = [];
    this.npcs = [];
    this.vehicles = [];
    this.policeCars = [];
    this.missionMarkers = [];
    this.missionIndex = 0;

    this.player = {
      position: new THREE.Vector3(0, 1.7, 35),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: -0.2,
      moveSpeed: 0,
      height: 1.7,
      onGround: true,
      sprinting: false,
      crouching: false,
      jumpVelocity: 0,
      health: 100,
      money: 2500,
      wanted: 0,
      ammo: 18,
      inVehicle: null,
      model: null,
      isAlive: true,
      shotCooldown: 0,
      recentHitFlash: 0
    };

    this.missions = [
      { title: 'Downtown Drop', text: 'Reach the downtown marker and earn $400.', target: new THREE.Vector3(80, 1, -80), reward: 400, done: false },
      { title: 'Safehouse Run', text: 'Drive to the south safehouse for $600.', target: new THREE.Vector3(-90, 1, 110), reward: 600, done: false },
      { title: 'Police Evasion', text: 'Get through the police zone and survive.', target: new THREE.Vector3(120, 1, 140), reward: 800, done: false }
    ];

    this.setupHUD();
    this.createWorld();
    this.createPlayer();
    this.spawnNPCs();
    this.spawnVehicles();
    this.createMissionMarker();
    this.bindEvents();
    this.showMessage('Mission started. Reach the first marker.', 2.5);
    this.updateHUD();
  }

  start() {
    requestAnimationFrame(this.animate.bind(this));
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.033);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate.bind(this));
  }

  setupHUD() {
    this.ui = {
      hp: document.getElementById('hp-value'),
      money: document.getElementById('money-value'),
      wanted: document.getElementById('wanted-value'),
      speed: document.getElementById('speed-value'),
      vehicle: document.getElementById('vehicle-value'),
      mission: document.getElementById('mission-text'),
      msg: document.getElementById('message')
    };
  }

  bindEvents() {
    window.addEventListener('keydown', (event) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === 'KeyE') this.interact();
      if (event.code === 'KeyF') this.toggleVehicle();
      if (event.code === 'KeyR') this.reloadWeapon();
      this.keys.add(event.code);
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });

    this.renderer.domElement.addEventListener('mousedown', () => {
      if (!this.pointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
      this.shoot();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    document.addEventListener('mousemove', (event) => {
      if (!this.pointerLocked) return;
      this.player.yaw -= event.movementX * 0.0025;
      this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - event.movementY * 0.0016, -1.2, 1.2);
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  createWorld() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({ color: 0x5f8a56, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2d32, roughness: 0.9 });
    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xf1df6d, emissive: 0x2d2200, roughness: 0.8 });
    const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xc7b79d, roughness: 1 });

    for (let x = -180; x <= 180; x += 24) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 420), roadMaterial);
      road.position.set(x, 0.1, 0);
      road.receiveShadow = true;
      this.scene.add(road);

      const sidewalkLeft = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 420), sidewalkMaterial);
      sidewalkLeft.position.set(x - 7, 0.15, 0);
      sidewalkLeft.receiveShadow = true;
      this.scene.add(sidewalkLeft);

      const sidewalkRight = sidewalkLeft.clone();
      sidewalkRight.position.x = x + 7;
      this.scene.add(sidewalkRight);
    }

    for (let z = -180; z <= 180; z += 24) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(420, 0.2, 10), roadMaterial);
      road.position.set(0, 0.1, z);
      road.receiveShadow = true;
      this.scene.add(road);

      const sidewalkFront = new THREE.Mesh(new THREE.BoxGeometry(420, 0.2, 12), sidewalkMaterial);
      sidewalkFront.position.set(0, 0.15, z - 7);
      sidewalkFront.receiveShadow = true;
      this.scene.add(sidewalkFront);

      const sidewalkBack = sidewalkFront.clone();
      sidewalkBack.position.z = z + 7;
      this.scene.add(sidewalkBack);
    }

    const roadCenter = new THREE.Mesh(new THREE.BoxGeometry(440, 0.12, 4), lineMaterial);
    roadCenter.position.set(0, 0.22, 0);
    this.scene.add(roadCenter);

    const roadCenter2 = roadCenter.clone();
    roadCenter2.position.z = -90;
    this.scene.add(roadCenter2);

    const roadCenter3 = roadCenter.clone();
    roadCenter3.position.z = 90;
    this.scene.add(roadCenter3);

    const addBuilding = (x, z, w, d, h, tint = 0xdfe3ea) => {
      const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, metalness: 0.1 });
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      building.position.set(x, h / 2, z);
      building.castShadow = true;
      building.receiveShadow = true;

      const windowPanel = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.92, h * 0.7, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x9bb6d9, emissive: 0x1b2b3e, emissiveIntensity: 0.65 })
      );
      windowPanel.position.set(0, 0, d / 2 + 0.1);
      building.add(windowPanel);

      this.buildings.push(building);
      this.scene.add(building);
      return building;
    };

    const blockOffsets = [
      [-110, -110], [-60, -110], [-10, -110], [40, -110], [90, -110],
      [-110, -50], [-60, -50], [-10, -50], [40, -50], [90, -50],
      [-110, 10], [-60, 10], [-10, 10], [40, 10], [90, 10],
      [-110, 70], [-60, 70], [-10, 70], [40, 70], [90, 70],
      [-110, 130], [-60, 130], [-10, 130], [40, 130], [90, 130]
    ];

    for (const [bx, bz] of blockOffsets) {
      const building = addBuilding(bx, bz, 14 + Math.random() * 8, 13 + Math.random() * 6, 18 + Math.random() * 30, 0xd9d6d1);
      if (Math.random() > 0.7) {
        const shop = addBuilding(bx + 8, bz, 8, 8, 12, 0xf1d9b5);
        shop.position.y = 6;
      }
      building.position.y = 0;
    }

    for (let i = 0; i < 9; i++) {
      const x = -150 + i * 38;
      const z = 170 + (i % 2) * 4;
      const shop = addBuilding(x, z, 12, 10, 16, 0xf7d7a7);
      shop.position.y = 8;
    }

    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 1, 16), new THREE.MeshStandardMaterial({ color: 0x86907b }));
    plaza.position.set(0, 0.5, 0);
    plaza.receiveShadow = true;
    this.scene.add(plaza);
  }

  createPlayer() {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0cf9a });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3d8dd7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2330 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.4), cloth);
    torso.position.y = 1.3;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 16), skin);
    head.position.y = 2.15;
    head.castShadow = true;
    group.add(head);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), dark);
    legL.position.set(-0.2, 0.45, 0);
    legL.castShadow = true;
    group.add(legL);

    const legR = legL.clone();
    legR.position.x = 0.2;
    group.add(legR);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.18), skin);
    armL.position.set(-0.6, 1.35, 0);
    armL.castShadow = true;
    group.add(armL);

    const armR = armL.clone();
    armR.position.x = 0.6;
    group.add(armR);

    group.position.copy(this.player.position);
    group.position.y = 0;
    group.rotation.y = this.player.yaw;
    this.scene.add(group);
    this.player.model = group;
  }

  spawnNPCs() {
    const colors = [0xea9b5d, 0x5b8ef4, 0x68c2b4, 0xe7d88c, 0xea6a67, 0x8a71ea];

    const points = [
      [-40, 55], [25, 70], [58, 35], [-80, -42], [90, -55], [-100, 90], [120, 60], [-120, -120], [0, -90], [110, -110]
    ];

    for (const [x, z] of points) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.35), bodyMat);
      torso.position.y = 1.25;
      torso.castShadow = true;
      group.add(torso);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshStandardMaterial({ color: 0xe7b98a }));
      head.position.y = 2.1;
      head.castShadow = true;
      group.add(head);

      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), new THREE.MeshStandardMaterial({ color: 0x1c1c1d }));
      legs.position.y = 0.45;
      legs.castShadow = true;
      group.add(legs);

      group.position.set(x, 0, z);
      this.scene.add(group);

      this.npcs.push({
        group,
        position: new THREE.Vector3(x, 0, z),
        velocity: new THREE.Vector3(),
        target: new THREE.Vector3(x + (Math.random() - 0.5) * 18, 0, z + (Math.random() - 0.5) * 18),
        speed: 2.5 + Math.random() * 3,
        mood: Math.random() > 0.5 ? 'walk' : 'idle',
        health: 100,
        type: 'civilian'
      });
    }
  }

  spawnVehicles() {
    const colors = [0xe54d42, 0x2f7fed, 0xf3d65b, 0x85d486, 0xe6a5c0, 0x8d8d93];

    for (let i = 0; i < 10; i++) {
      const car = this.createVehicle(
        30 + i * 14,
        -100 + (i % 5) * 22,
        Math.PI / 2 + (Math.random() * 0.8 - 0.4),
        colors[i % colors.length],
        'civilian'
      );
      this.vehicles.push(car);
    }

    for (let i = 0; i < 3; i++) {
      const police = this.createVehicle(
        -60 + i * 30,
        160 + i * 8,
        -Math.PI / 2,
        0x1d5aff,
        'police'
      );
      police.behavior = 'patrol';
      this.policeCars.push(police);
      this.vehicles.push(police);
    }
  }

  createVehicle(x, z, heading, color, type) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: type === 'police' ? 0x11171d : 0x1f2328 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.8, 5), bodyMat);
    base.position.y = 0.8;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 2.5), new THREE.MeshStandardMaterial({ color: type === 'police' ? 0xc2d1ff : 0xc9d9ea, roughness: 0.4 }));
    cabin.position.set(0, 1.3, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    for (const wx of [-1.1, 1.1]) {
      for (const wz of [-1.8, 1.8]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.45, 12), darkMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.4, wz);
        wheel.castShadow = true;
        group.add(wheel);
      }
    }

    if (type === 'police') {
      const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x20252d }));
      lightBar.position.set(0, 1.7, 1.8);
      group.add(lightBar);
      const light1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.15), new THREE.MeshStandardMaterial({ color: 0xff1f3d, emissive: 0xff0b27, emissiveIntensity: 1.1 }));
      light1.position.set(-0.4, 1.8, 1.95);
      const light2 = light1.clone();
      light2.position.x = 0.4;
      group.add(light1, light2);
    }

    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);

    return {
      group,
      type,
      heading,
      speed: 0,
      maxSpeed: type === 'police' ? 22 : 16,
      steering: 0,
      color,
      position: new THREE.Vector3(x, 0, z),
      hasDriver: false
    };
  }

  createMissionMarker() {
    const mission = this.missions[this.missionIndex];
    const marker = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x52d4ff, emissive: 0x0d7fb9, emissiveIntensity: 0.8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.32, 16, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    marker.add(ring);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xf4f2b2, emissive: 0x6d5a00, emissiveIntensity: 0.6 }));
    core.position.y = 0.7;
    marker.add(core);

    const target = mission.target.clone();
    marker.position.set(target.x, 0, target.z);
    this.scene.add(marker);
    this.missionMarkers.push(marker);
  }

  update(delta) {
    this.now += delta;
    this.updateLighting();
    this.updatePlayer(delta);
    this.updateNPCs(delta);
    this.updateVehicles(delta);
    this.updatePolice(delta);
    this.updateMissions(delta);
    this.updateCamera(delta);
    this.updateHUD();
    this.drawMinimap();
    this.player.shotCooldown = Math.max(0, this.player.shotCooldown - delta);
    this.player.recentHitFlash = Math.max(0, this.player.recentHitFlash - delta * 1.5);
  }

  updateLighting() {
    const t = (this.now * 0.035) % 1;
    const dayFactor = (Math.sin(t * Math.PI * 2 - 1.2) + 1) * 0.5;
    const sky = new THREE.Color().setHSL(0.62, 0.5, 0.4 + dayFactor * 0.2);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);

    const sunAngle = (this.now * 0.12) % (Math.PI * 2);
    const sunHeight = 35 + Math.sin(sunAngle) * 60;
    this.sun.position.set(Math.cos(sunAngle) * 120, sunHeight, Math.sin(sunAngle) * 80);
    this.sun.intensity = 0.25 + dayFactor * 1.5;
    this.ambient.intensity = 0.3 + dayFactor * 1.2;
  }

  updatePlayer(delta) {
    if (!this.player.isAlive) {
      this.player.position.set(0, 1.7, 35);
      this.player.health = 100;
      this.player.isAlive = true;
      this.player.wanted = 0;
      this.showMessage('You were revived at the city spawn.', 2.5);
    }

    if (this.player.inVehicle) {
      this.player.position.copy(this.player.inVehicle.group.position);
      this.player.position.y = 1.8;
      this.player.model.visible = false;
      this.player.model.position.copy(this.player.position);
      return;
    }

    this.player.model.visible = true;
    const forward = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const input = new THREE.Vector3();

    if (this.keys.has('KeyW')) input.add(forward);
    if (this.keys.has('KeyS')) input.sub(forward);
    if (this.keys.has('KeyA')) input.sub(right);
    if (this.keys.has('KeyD')) input.add(right);

    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.player.sprinting = sprinting && input.lengthSq() > 0;
    this.player.crouching = this.keys.has('ControlLeft') || this.keys.has('ControlRight');

    const moveSpeed = this.player.crouching ? 3.5 : this.player.sprinting ? 12 : 7;
    const accel = input.lengthSq() > 0 ? 18 : 10;
    const targetVelocity = input.lengthSq() > 0 ? input.normalize().multiplyScalar(moveSpeed) : new THREE.Vector3();

    this.player.velocity.x = THREE.MathUtils.damp(this.player.velocity.x, targetVelocity.x, accel, delta);
    this.player.velocity.z = THREE.MathUtils.damp(this.player.velocity.z, targetVelocity.z, accel, delta);

    if (this.keys.has('Space') && this.player.onGround) {
      this.player.jumpVelocity = 7.5;
      this.player.onGround = false;
    }

    this.player.jumpVelocity -= 20 * delta;
    this.player.position.y += this.player.jumpVelocity * delta;

    if (this.player.position.y <= 1.7) {
      this.player.position.y = 1.7;
      this.player.jumpVelocity = 0;
      this.player.onGround = true;
    }

    this.player.position.addScaledVector(this.player.velocity, delta);
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -180, 180);
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -180, 180);

    this.player.model.position.set(this.player.position.x, this.player.position.y - 1.7, this.player.position.z);
    this.player.model.rotation.y = this.player.yaw;

    if (this.player.position.y > 1.7) {
      this.player.model.position.y = 0;
    }
  }

  updateNPCs(delta) {
    this.npcs.forEach((npc) => {
      const d = new THREE.Vector3().subVectors(this.player.position, npc.position);
      const dist = d.length();

      if (dist < 18 && this.player.wanted > 0.2) {
        npc.target.copy(this.player.position).add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
      } else if (npc.target.distanceTo(npc.position) < 3) {
        npc.target.set(
          npc.position.x + (Math.random() - 0.5) * 18,
          0,
          npc.position.z + (Math.random() - 0.5) * 18
        );
      }

      const toTarget = new THREE.Vector3().subVectors(npc.target, npc.position);
      if (toTarget.lengthSq() > 0.0001) {
        toTarget.normalize();
        npc.position.addScaledVector(toTarget, npc.speed * delta);
        npc.group.position.set(npc.position.x, 0, npc.position.z);
        npc.group.rotation.y = Math.atan2(toTarget.x, toTarget.z);
      }
    });
  }

  updateVehicles(delta) {
    this.vehicles.forEach((vehicle) => {
      if (vehicle.type === 'police') return;

      vehicle.heading += (Math.random() - 0.5) * 0.025;
      vehicle.speed = THREE.MathUtils.damp(vehicle.speed, 8 + Math.sin(this.now * 0.5 + vehicle.position.x) * 3, 5, delta);
      vehicle.position.x += Math.sin(vehicle.heading) * vehicle.speed * delta;
      vehicle.position.z += Math.cos(vehicle.heading) * vehicle.speed * delta;

      if (Math.abs(vehicle.position.x) > 170 || Math.abs(vehicle.position.z) > 170) {
        vehicle.heading += Math.PI * 0.5;
      }

      vehicle.group.position.set(vehicle.position.x, 0, vehicle.position.z);
      vehicle.group.rotation.y = vehicle.heading;
    });

    if (this.player.inVehicle) {
      const car = this.player.inVehicle;
      const steer = (this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('KeyD') ? 1 : 0);
      const throttle = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      car.speed += throttle * 18 * delta;
      car.speed *= 0.985;
      car.speed = THREE.MathUtils.clamp(car.speed, -10, car.maxSpeed);
      car.heading += steer * 0.03 * (Math.abs(car.speed) / 10 + 0.2);
      car.position.x += Math.sin(car.heading) * car.speed * delta;
      car.position.z += Math.cos(car.heading) * car.speed * delta;
      car.group.position.set(car.position.x, 0, car.position.z);
      car.group.rotation.y = car.heading;
      this.player.position.copy(car.position);
      this.player.position.y = 1.8;
    }
  }

  updatePolice(delta) {
    this.policeCars.forEach((car) => {
      const target = this.player.inVehicle ? this.player.inVehicle.position : this.player.position;
      const toPlayer = new THREE.Vector3().subVectors(target, car.position);
      const dist = toPlayer.length();

      if (this.player.wanted > 0.05 || dist < 40) {
        car.behavior = 'chase';
      } else {
        car.behavior = 'patrol';
      }

      if (car.behavior === 'chase') {
        const desiredHeading = Math.atan2(toPlayer.x, toPlayer.z);
        car.heading = THREE.MathUtils.lerp(car.heading, desiredHeading, 0.04);
        car.speed = THREE.MathUtils.damp(car.speed, this.player.wanted > 0.05 ? 18 : 11, 6, delta);
      } else {
        car.speed = THREE.MathUtils.damp(car.speed, 8, 5, delta);
        car.heading += Math.sin(this.now * 0.5 + car.position.x) * 0.02;
      }

      car.position.x += Math.sin(car.heading) * car.speed * delta;
      car.position.z += Math.cos(car.heading) * car.speed * delta;
      car.group.position.set(car.position.x, 0, car.position.z);
      car.group.rotation.y = car.heading;

      const playerPos = this.player.inVehicle ? this.player.inVehicle.position : this.player.position;
      if (car.position.distanceTo(playerPos) < 7) {
        this.player.health -= 18 * delta;
        this.player.recentHitFlash = 1;
        this.player.wanted = Math.min(5, this.player.wanted + 0.12);
      }
    });

    this.player.wanted = Math.max(0, this.player.wanted - 0.015 * delta * 60);
  }

  updateMissions(delta) {
    const current = this.missions[this.missionIndex];
    if (!current) return;

    const marker = this.missionMarkers[0];
    if (marker) {
      marker.visible = true;
      marker.rotation.y += delta * 2.2;
    }

    const targetPos = current.target;
    const playerPos = this.player.inVehicle ? this.player.inVehicle.position : this.player.position;
    if (playerPos.distanceTo(targetPos) < 8) {
      this.player.money += current.reward;
      this.showMessage(`${current.title} complete: +$${current.reward}`, 2.5);
      this.missionIndex += 1;
      if (this.missionIndex < this.missions.length) {
        const next = this.missions[this.missionIndex];
        this.ui.mission.textContent = next.text;
        const newMarker = this.missionMarkers[0];
        if (newMarker) {
          newMarker.position.copy(next.target);
        }
      } else {
        this.ui.mission.textContent = 'City cleared. Free roam unlocked.';
        if (this.missionMarkers[0]) this.missionMarkers[0].visible = false;
      }
    }
  }

  updateCamera(delta) {
    const targetPos = this.player.inVehicle ? this.player.inVehicle.position.clone() : this.player.position.clone();
    const lookTarget = new THREE.Vector3(
      targetPos.x + Math.sin(this.player.yaw) * 8,
      1.5 + Math.sin(this.player.pitch) * 1.5,
      targetPos.z + Math.cos(this.player.yaw) * 8
    );

    const camOffset = new THREE.Vector3(
      -Math.sin(this.player.yaw) * 9,
      4.8,
      -Math.cos(this.player.yaw) * 9
    );

    const desired = targetPos.clone().add(camOffset);
    this.camera.position.lerp(desired, 0.12);
    this.camera.lookAt(lookTarget);
  }

  shoot() {
    if (this.player.shotCooldown > 0) return;
    if (this.player.inVehicle) return;

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const raycaster = new THREE.Raycaster(this.camera.position, dir, 0, 80);
    const intersects = raycaster.intersectObjects(this.pickables, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const parent = hit.parent;
      const npc = this.npcs.find((n) => n.group === parent || n.group.children.includes(hit));
      if (npc) {
        npc.health -= 35;
        if (npc.health <= 0) {
          npc.group.visible = false;
          this.player.money += 120;
          this.showMessage('Target neutralized. +$120', 1.8);
        }
      }

      this.player.wanted = Math.min(5, this.player.wanted + 0.7);
    }

    this.player.shotCooldown = 0.17;
    this.player.ammo = Math.max(0, this.player.ammo - 1);
    if (this.player.ammo <= 0) {
      this.showMessage('Out of ammo. Press R to reload.', 1.5);
      this.player.ammo = 0;
    }
  }

  reloadWeapon() {
    if (this.player.money < 50) {
      this.showMessage('Need $50 for ammo.', 1.5);
      return;
    }
    this.player.money -= 50;
    this.player.ammo = 18;
    this.showMessage('Reloaded pistol.', 1.5);
  }

  interact() {
    const playerPos = this.player.inVehicle ? this.player.inVehicle.position : this.player.position;

    const nearbyVehicle = this.vehicles.find((v) => v.position.distanceTo(playerPos) < 8);
    if (nearbyVehicle && !this.player.inVehicle) {
      this.player.inVehicle = nearbyVehicle;
      this.showMessage('Vehicle entered.', 1.6);
      return;
    }

    if (this.player.inVehicle && playerPos.distanceTo(this.player.inVehicle.position) < 8) {
      this.player.inVehicle = null;
      this.player.position.copy(this.player.inVehicle ? this.player.inVehicle.position : this.player.position);
      this.showMessage('Exited vehicle.', 1.6);
      return;
    }

    const mission = this.missions[this.missionIndex];
    if (mission && playerPos.distanceTo(mission.target) < 9) {
      this.showMessage('Mission complete. Continue to the next objective.', 2);
      return;
    }

    if (this.player.money >= 250) {
      this.player.money -= 250;
      this.player.health = Math.min(100, this.player.health + 40);
      this.showMessage('Bought medkit and health restored.', 2);
      return;
    }

    this.showMessage('No nearby interaction.', 1.4);
  }

  toggleVehicle() {
    if (this.player.inVehicle) {
      this.player.inVehicle = null;
      this.showMessage('Exited vehicle.', 1.5);
      return;
    }

    const playerPos = this.player.position;
    const nearby = this.vehicles.find((v) => v.position.distanceTo(playerPos) < 7);
    if (nearby) {
      this.player.inVehicle = nearby;
      this.showMessage('Vehicle entered.', 1.5);
    }
  }

  showMessage(text, duration = 1.5) {
    this.ui.msg.textContent = text;
    this.ui.msg.classList.add('visible');
    this.messageTimer = duration;
  }

  updateHUD() {
    const speedKmh = this.player.inVehicle
      ? Math.round(Math.abs(this.player.inVehicle.speed) * 12)
      : Math.round(this.player.velocity.length() * 18);

    this.ui.hp.textContent = `${Math.max(0, Math.round(this.player.health))}`;
    this.ui.money.textContent = `$${this.player.money}`;
    this.ui.wanted.textContent = `${this.player.wanted.toFixed(1)}`;
    this.ui.speed.textContent = `${speedKmh} km/h`;
    this.ui.vehicle.textContent = this.player.inVehicle ? this.player.inVehicle.type === 'police' ? 'Police' : 'Car' : 'On Foot';

    const mission = this.missions[this.missionIndex];
    if (mission) {
      this.ui.mission.textContent = mission.text;
    }

    if (this.messageTimer > 0) {
      this.messageTimer -= 0.016;
      if (this.messageTimer <= 0) {
        this.ui.msg.classList.remove('visible');
      }
    }

    if (this.player.health <= 0) {
      this.player.health = 100;
      this.player.isAlive = false;
      this.player.position.set(0, 1.7, 35);
      this.player.wanted = 0;
      this.showMessage('Respawned at the city center.', 2.2);
    }
  }

  drawMinimap() {
    const canvas = document.getElementById('minimap');
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scale = 0.55;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d1c28';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#394d63';
    ctx.lineWidth = 2;
    for (let x = -180; x <= 180; x += 24) {
      const px = cx + x * scale;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
      ctx.stroke();
    }
    for (let z = -180; z <= 180; z += 24) {
      const py = cy + z * scale;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvas.width, py);
      ctx.stroke();
    }

    this.npcs.forEach((npc) => {
      const px = cx + npc.position.x * scale;
      const py = cy + npc.position.z * scale;
      ctx.fillStyle = '#7ae0a6';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    });

    this.policeCars.forEach((cop) => {
      const px = cx + cop.position.x * scale;
      const py = cy + cop.position.z * scale;
      ctx.fillStyle = '#ff4d73';
      ctx.fillRect(px - 3, py - 3, 6, 6);
    });

    const pPos = this.player.inVehicle ? this.player.inVehicle.position : this.player.position;
    const px = cx + pPos.x * scale;
    const py = cy + pPos.z * scale;
    ctx.fillStyle = '#f7f4cf';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    const mission = this.missions[this.missionIndex];
    if (mission) {
      const mx = cx + mission.target.x * scale;
      const my = cy + mission.target.z * scale;
      ctx.strokeStyle = '#63d9ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
