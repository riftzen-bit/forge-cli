import React from 'react';
import { Box, Text } from 'ink';
import { Chrome, getTheme, Spacing, type Radius } from '../../ui/theme.js';

type Props = {
  title?: string;
  rightLabel?: string;
  borderColor?: string;
  titleColor?: string;
  rightLabelColor?: string;
  radius?: Radius;
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
  marginBottom?: number;
  // When true, render the panel without a border (still groups children
  // with consistent padding). Useful for live-status sections that are
  // visually noisy with borders.
  borderless?: boolean;
  children?: React.ReactNode;
};

// Bordered, optionally titled panel. Single source of truth for the
// "round border, accent title, dim right label" pattern used everywhere.
// Use this instead of typing `borderStyle="round" borderColor=... paddingX={1}`
// inline so chrome stays consistent across the app.
export function Panel({
  title,
  rightLabel,
  borderColor,
  titleColor,
  rightLabelColor,
  radius = Chrome.radius,
  paddingX = Chrome.paddingX,
  paddingY = Chrome.paddingY,
  marginTop = 0,
  marginBottom = 0,
  borderless = false,
  children,
}: Props) {
  const t = getTheme();
  const border = borderColor ?? t.borderIdle;
  const titleC = titleColor ?? border;
  const rightC = rightLabelColor ?? t.muted;

  const headerRow = title || rightLabel ? (
    <Box>
      {title && <Text color={titleC} bold>{title}</Text>}
      {title && rightLabel && <Box flexGrow={1} />}
      {rightLabel && <Text color={rightC}>{rightLabel}</Text>}
    </Box>
  ) : null;

  if (borderless) {
    return (
      <Box
        flexDirection="column"
        marginTop={marginTop}
        marginBottom={marginBottom}
        paddingX={paddingX}
        paddingY={paddingY}
      >
        {headerRow}
        {headerRow && <Box marginTop={Spacing.xs} />}
        {children}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      marginTop={marginTop}
      marginBottom={marginBottom}
      borderStyle={radius}
      borderColor={border}
      paddingX={paddingX}
      paddingY={paddingY}
    >
      {headerRow}
      {children}
    </Box>
  );
}
