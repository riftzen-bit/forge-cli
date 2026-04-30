import { Box, Text } from 'ink';
import type { TurnState } from '../../runtime/turnState.js';
import { buildTurnViewModel } from './viewModel.js';

export interface AppProps {
  snapshot: TurnState;
}

export function App({ snapshot }: AppProps) {
  const view = buildTurnViewModel(snapshot);

  return (
    <Box flexDirection="column">
      <Text bold>{view.status}</Text>
      {view.rows.map((row, index) => (
        <Text key={`${index}:${row}`}>{row}</Text>
      ))}
    </Box>
  );
}
