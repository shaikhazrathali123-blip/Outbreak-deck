import Phaser from 'phaser';

const prop = (obj, name) => obj.properties?.find((p) => p.name === name)?.value;

/** Glowing room-name plates over doorways, from the map's "Signs" layer. */
export default class SignSystem {
  constructor(scene, map, depth = 4) {
    this.objects = [];
    for (const obj of map.getObjectLayer('Signs')?.objects ?? []) {
      const color = prop(obj, 'color') ?? '#e8f4ff';
      const text = scene.add
        .text(obj.x, obj.y, prop(obj, 'text') ?? '', {
          fontFamily: '"Consolas", "Menlo", monospace',
          fontSize: '9px',
          fontStyle: 'bold',
          color,
          resolution: 3,
        })
        .setOrigin(0.5)
        .setShadow(0, 0, color, 6, false, true)
        .setDepth(depth + 0.1);
      const plate = scene.add
        .rectangle(obj.x, obj.y, text.width + 10, text.height + 4, 0x070a10, 0.85)
        .setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(color).color, 0.7)
        .setDepth(depth);
      this.objects.push(plate, text);
    }
  }
}
