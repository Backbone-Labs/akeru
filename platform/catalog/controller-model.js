/** Loaded only for a trusted host-configured model URL; never a game-provided asset. */
export async function mountControllerModel(target, url) {
  const THREE = await import('/vendor/three/three.module.js');
  const { MeshoptDecoder } =
    await import('/vendor/three/meshopt_decoder.module.js');
  const { GLTFLoader } = await import('/vendor/three/GLTFLoader.js');
  const { RoomEnvironment } = await import('/vendor/three/RoomEnvironment.js');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  const studio = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.4;
  studio.dispose();
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x959595, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-3, 1, -1);
  scene.add(fill);
  let model,
    frame,
    disposed = false;
  let resumeAnimation = () => {};
  const onVisibility = () => {
    cancelAnimationFrame(frame);
    if (!document.hidden) resumeAnimation();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.addEventListener('change', onVisibility);
  const resources = new Set();
  const cleanup = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    reducedMotion.removeEventListener('change', onVisibility);
    for (const resource of resources) resource.dispose?.();
    environment.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    target.classList.remove('model-ready');
  };
  const resize = () => {
    renderer.setSize(target.clientWidth, target.clientHeight, false);
    camera.aspect = target.clientWidth / Math.max(1, target.clientHeight);
    camera.updateProjectionMatrix();
    if (model) renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  try {
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(url);
    model = gltf.scene;
    model.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of (Array.isArray(object.material)
        ? object.material
        : [object.material]
      ).filter(Boolean)) {
        resources.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) resources.add(value);
      }
    });
    if (!target.isConnected) {
      cleanup();
      return cleanup;
    }
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const group = new THREE.Group();
    group.add(model);
    group.scale.setScalar(3.6 / Math.max(size.x, size.y, size.z));
    group.rotation.set(0.28, -0.35, -0.06);
    scene.add(group);
    camera.position.set(0, 0, 5.1);
    target.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    target.classList.add('model-ready');
    observer.observe(target);
    resize();

    const animate = (time) => {
      if (disposed || !target.isConnected) {
        cleanup();
        return;
      }
      group.rotation.y = reducedMotion.matches
        ? -0.35
        : -0.35 + Math.sin(time / 4000) * 0.1;
      renderer.render(scene, camera);
      if (!reducedMotion.matches && !document.hidden)
        frame = requestAnimationFrame(animate);
    };
    resumeAnimation = () => animate(performance.now());
    resumeAnimation();
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
