import * as THREE from 'three';

/** Per-instance ownership. Immutable recipe data is shared; GPU objects never cross instances. */
export class OwnedResources {
  private resources = new Set<{ dispose(): void }>();
  private cleanups: (() => void)[] = [];
  private disposed = false;

  own<T extends { dispose(): void }>(value: T): T {
    if (this.disposed) { value.dispose(); throw new Error('Resource owner is disposed.'); }
    this.resources.add(value);
    return value;
  }

  cleanup(fn: () => void) { this.cleanups.push(fn); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.forEach(resource => resource.dispose());
    this.resources.clear();
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
  }
}

export class WatchPart extends OwnedResources {
  readonly group = new THREE.Group();

  mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    semanticId: string, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(this.own(geometry), material);
    mesh.name = name;
    mesh.userData.semanticId = semanticId;
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  override dispose() {
    super.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
