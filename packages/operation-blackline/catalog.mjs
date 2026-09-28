import { titleOptions } from '../arcade-preview/catalog.mjs';
export function blacklineOptions() {
  const result = titleOptions(
    'operation-blackline',
    {
      title: 'Operation Blackline',
      summary: 'Private squad battles in a procedural desert town.',
      description:
        'An open-source 5v5 team FPS with bot-filled teams, three weapons and guest multiplayer rooms. Local evaluation build.',
      category: 'action',
      creator: 'Operation Blackline contributors',
      controls: {
        controller: [
          'Left stick: move. Right stick: look. RT: fire. LT: aim. A: jump. B: crouch. X: reload. Y: switch weapon. LB: sprint. View: scoreboard.',
        ],
        touch: [
          'Two touch sticks move and look. On-screen controls fire, aim, jump, crouch, reload, sprint and switch weapon. Keyboard: WASD, mouse, Space, Shift, Ctrl and R.',
        ],
      },
      saves:
        'Settings save locally through the host; live matches are not save states.',
    },
    { graphics: 'webgl2', assetRequests: true, license: 'MIT' },
  );
  result.manifest.capabilities.push('multiplayer.rooms.v1');
  result.metadata.privacy = [
    'The Akeru host connects to its configured private-room server. No account is required. Settings stay in host-owned local storage.',
  ];
  return result;
}
