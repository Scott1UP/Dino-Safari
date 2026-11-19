// The cast: the ten headliners, redrawn for the safari. Names and card numbers are copied from Dino Ripper;
// nothing is read from that game at runtime.

export type DinoId =
  | 'trike' | 'spino' | 'para' | 'raptor' | 'dilo' | 'brachio' | 'stego' | 'anky' | 'ptera' | 'rex'
  | 'pachy' | 'carno' | 'kentro' | 'troodon' | 'dimorph' | 'utah' | 'theri' | 'styraco' | 'quetzal' | 'giga';
export type PoseId = 'standing' | 'special' | 'eating' | 'drum';

/** Poses always appear in this order in the binder. */
export const POSES: PoseId[] = ['standing', 'special', 'eating', 'drum'];

export interface DinoInfo {
  id: DinoId;
  /** Spoken by the guide; shown small in the binder for grown-ups. */
  name: string;
  /** Dino Ripper card number: the order of the binder's pages. */
  binderOrder: number;
  /** Height of the standing pose in the world, in metres. */
  height: number;
  /** Other poses are sized to cover the same area as the standing pose, times this. */
  poseScale?: Partial<Record<PoseId, number>>;
}

export const DINOS: Record<DinoId, DinoInfo> = {
  para: { id: 'para', name: 'Parasaurolophus', binderOrder: 12, height: 3.3 },
  dilo: { id: 'dilo', name: 'Dilophosaurus', binderOrder: 38, height: 2.5 },
  rex: { id: 'rex', name: 'Tyrannosaurus rex', binderOrder: 61, height: 5.4 },
  spino: { id: 'spino', name: 'Spinosaurus', binderOrder: 62, height: 5 },
  trike: { id: 'trike', name: 'Triceratops', binderOrder: 63, height: 2.4 },
  raptor: { id: 'raptor', name: 'Velociraptor', binderOrder: 64, height: 1.8 },
  brachio: { id: 'brachio', name: 'Brachiosaurus', binderOrder: 65, height: 10 },
  anky: { id: 'anky', name: 'Ankylosaurus', binderOrder: 66, height: 2 },
  stego: { id: 'stego', name: 'Stegosaurus', binderOrder: 68, height: 3.3 },
  ptera: { id: 'ptera', name: 'Pteranodon', binderOrder: 71, height: 2.1, poseScale: { special: 1.25 } },
  // --- level 2, the Volcano Mine
  pachy: { id: 'pachy', name: 'Pachycephalosaurus', binderOrder: 13, height: 2.3 },
  troodon: { id: 'troodon', name: 'Troodon', binderOrder: 21, height: 1.6 },
  dimorph: { id: 'dimorph', name: 'Dimorphodon', binderOrder: 27, height: 1.4, poseScale: { special: 1.25 } },
  styraco: { id: 'styraco', name: 'Styracosaurus', binderOrder: 41, height: 2.8 },
  kentro: { id: 'kentro', name: 'Kentrosaurus', binderOrder: 43, height: 2.6 },
  giga: { id: 'giga', name: 'Gigantosaurus', binderOrder: 67, height: 6 },
  carno: { id: 'carno', name: 'Carnotaurus', binderOrder: 70, height: 4.2 },
  theri: { id: 'theri', name: 'Therizinosaurus', binderOrder: 73, height: 5.4 },
  quetzal: { id: 'quetzal', name: 'Quetzalcoatlus', binderOrder: 75, height: 5, poseScale: { special: 1.3 } },
  utah: { id: 'utah', name: 'Utahraptor', binderOrder: 76, height: 2.7 },
};

/** A level's cast, in the order of its binder's pages. */
export const castOf = (ids: DinoId[]): DinoInfo[] => ids.map((id) => DINOS[id]).sort((a, b) => a.binderOrder - b.binderOrder);

export const poseSprite = (dino: DinoId, pose: PoseId) => `art/dinos/${dino}/${pose}.webp`;
