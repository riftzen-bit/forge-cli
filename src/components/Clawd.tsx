import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Segments = {
  r1L: string;
  r1E: string;
  r1R: string;
  r2L: string;
  r2R: string;
};

const POSES: Record<ClawdPose, Segments> = {
  default:      { r1L: ' ▐', r1E: '▛███▜', r1R: '▌', r2L: '▝▜', r2R: '▛▘' },
  'look-left':  { r1L: ' ▐', r1E: '▟███▟', r1R: '▌', r2L: '▝▜', r2R: '▛▘' },
  'look-right': { r1L: ' ▐', r1E: '▙███▙', r1R: '▌', r2L: '▝▜', r2R: '▛▘' },
  'arms-up':    { r1L: '▗▟', r1E: '▛███▜', r1R: '▙▖', r2L: ' ▜', r2R: '▛ ' },
};

type Props = { pose?: ClawdPose };

export function Clawd({ pose = 'default' }: Props) {
  const t = getTheme();
  const p = POSES[pose];
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={t.clawdBody}>{p.r1L}</Text>
        <Text color={t.clawdBody} backgroundColor={t.clawdBackground}>{p.r1E}</Text>
        <Text color={t.clawdBody}>{p.r1R}</Text>
      </Text>
      <Text>
        <Text color={t.clawdBody}>{p.r2L}</Text>
        <Text color={t.clawdBody} backgroundColor={t.clawdBackground}>█████</Text>
        <Text color={t.clawdBody}>{p.r2R}</Text>
      </Text>
      <Text color={t.clawdBody}>{'  '}▘▘ ▝▝{'  '}</Text>
    </Box>
  );
}
