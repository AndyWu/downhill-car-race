// Quality tiers. Chosen from ?q= (low | medium | default | high) or createMaterials(renderer,{quality}).
export const TIERS = {
  low: {
    name: 'low', steps: [0.7, 0.6, 0.5], dpr: 1, msaa: 0, bloom: false, reflection: false, refraction: false, motionBlur: false,
    shadowMap: 1024, shadowExtent: 32, parallax: 0, tex: 256, headlightShadow: false, maxDrops: 10, grade: 0.6,
  },
  medium: {
    name: 'medium', steps: [0.85, 0.75, 0.65, 0.55], dpr: 1.5, msaa: 0, bloom: true, reflection: true, reflScale: 0.3, refraction: true, motionBlur: false,
    shadowMap: 1536, shadowExtent: 38, parallax: 6, tex: 320, headlightShadow: false, maxDrops: 20, grade: 1,
  },
  default: {
    name: 'default', steps: [1, 0.9, 0.8, 0.7, 0.6], dpr: 2, msaa: 4, bloom: true, reflection: true, reflScale: 0.4, refraction: true, motionBlur: true,
    shadowMap: 2048, shadowExtent: 42, parallax: 10, tex: 384, headlightShadow: true, maxDrops: 32, grade: 1,
  },
  high: {
    name: 'high', steps: [1, 0.9, 0.8, 0.7, 0.6], dpr: 2, msaa: 4, bloom: true, reflection: true, reflScale: 0.5, refraction: true, motionBlur: true,
    shadowMap: 2048, shadowExtent: 42, parallax: 16, tex: 512, headlightShadow: true, maxDrops: 32, grade: 1,
  },
};
const ALIAS = { med: 'medium', mid: 'medium', normal: 'default', std: 'default', hi: 'high', lo: 'low' };
function fromURL() {
  try { const q = new URLSearchParams(location.search).get('q'); return q ? (ALIAS[q] || q) : null; } catch { return null; }
}
let current = TIERS[fromURL()] || TIERS.default;
export function setTier(name) { const n = ALIAS[name] || name; if (TIERS[n]) current = TIERS[n]; return current; }
export function getTier() { return current; }
